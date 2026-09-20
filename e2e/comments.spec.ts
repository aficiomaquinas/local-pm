import { test, expect, type APIRequestContext } from '@playwright/test'
import { createTicket, seedProject, type SeedRefs } from './helpers'

let refs: SeedRefs
let memberId: string
let memberName: string

async function createComment(request: APIRequestContext, data: Record<string, unknown>) {
  return request.post('/api/comments?depth=0', { data })
}

async function newTicket(request: APIRequestContext, title: string): Promise<string> {
  const res = await createTicket(request, refs, { title, status: 'TODO' })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).doc.id
}

test.beforeAll(async ({ request }) => {
  refs = await seedProject(request, 'comments')
  memberName = `Commenter${refs.prefix}`
  const res = await request.post('/api/members', { data: { name: memberName, team: refs.teamId } })
  expect(res.ok()).toBeTruthy()
  memberId = (await res.json()).doc.id
})

test.describe('the comments collection', () => {
  test('posts a comment and reads it back on the ticket', async ({ request }) => {
    const ticketId = await newTicket(request, 'Has a comment')

    const created = await createComment(request, { ticket: ticketId, body: 'First thought.' })
    expect(created.ok()).toBeTruthy()

    const list = await request.get(
      `/api/comments?depth=0&sort=createdAt&where[ticket][equals]=${ticketId}`,
    )
    const bodies = (await list.json()).docs.map((c: { body: string }) => c.body)
    expect(bodies).toEqual(['First thought.'])
  })

  test('refuses an empty comment', async ({ request }) => {
    const ticketId = await newTicket(request, 'Rejects empty')
    const res = await createComment(request, { ticket: ticketId, body: '   ' })
    expect(res.ok()).toBeFalsy()
  })

  test('resolves @mentions in the body into the mentions array', async ({ request }) => {
    const ticketId = await newTicket(request, 'Mentions someone')

    const created = await createComment(request, {
      ticket: ticketId,
      body: `cc @[${memberName}](member:${memberId}) please take a look`,
    })
    expect(created.ok()).toBeTruthy()

    const comment = (await created.json()).doc
    expect(comment.mentions).toEqual([memberId])
  })

  test('drops a mention of somebody who does not exist', async ({ request }) => {
    const ticketId = await newTicket(request, 'Mentions a ghost')
    const created = await createComment(request, {
      ticket: ticketId,
      body: 'cc @[Ghost](member:000000000000000000000000)',
    })
    expect(created.ok()).toBeTruthy()
    expect((await created.json()).doc.mentions).toEqual([])
  })

  test('allows one level of threading and refuses a reply to a reply', async ({ request }) => {
    const ticketId = await newTicket(request, 'Threads once')

    const root = await createComment(request, { ticket: ticketId, body: 'Root' })
    const rootId = (await root.json()).doc.id

    const reply = await createComment(request, {
      ticket: ticketId,
      body: 'Reply',
      parent: rootId,
    })
    expect(reply.ok()).toBeTruthy()
    const replyId = (await reply.json()).doc.id

    const nested = await createComment(request, {
      ticket: ticketId,
      body: 'Reply to the reply',
      parent: replyId,
    })
    expect(nested.ok()).toBeFalsy()
    expect(JSON.stringify(await nested.json())).toContain('opened the thread')
  })

  test('refuses to resolve a reply, because resolution belongs to the thread', async ({ request }) => {
    const ticketId = await newTicket(request, 'Resolves the root only')

    const root = await createComment(request, { ticket: ticketId, body: 'Root' })
    const rootId = (await root.json()).doc.id
    const reply = await createComment(request, { ticket: ticketId, body: 'Reply', parent: rootId })
    const replyId = (await reply.json()).doc.id

    const resolveRoot = await request.patch(`/api/comments/${rootId}?depth=0`, {
      data: { resolved: true },
    })
    expect(resolveRoot.ok()).toBeTruthy()
    expect((await resolveRoot.json()).doc.resolvedAt).toBeTruthy()

    const resolveReply = await request.patch(`/api/comments/${replyId}?depth=0`, {
      data: { resolved: true },
    })
    expect(resolveReply.ok()).toBeFalsy()
  })

  test('editing a body stamps editedAt and re-derives the mentions', async ({ request }) => {
    const ticketId = await newTicket(request, 'Edited comment')
    const created = await createComment(request, { ticket: ticketId, body: 'No mentions here' })
    const commentId = (await created.json()).doc.id

    const edited = await request.patch(`/api/comments/${commentId}?depth=0`, {
      data: { body: `now with @[${memberName}](member:${memberId})` },
    })
    expect(edited.ok()).toBeTruthy()

    const doc = (await edited.json()).doc
    expect(doc.editedAt).toBeTruthy()
    expect(doc.mentions).toEqual([memberId])
  })

  test('deleting the comment that opened a thread takes its replies with it', async ({
    request,
  }) => {
    const ticketId = await newTicket(request, 'Cascades to replies')

    const root = await createComment(request, { ticket: ticketId, body: 'Root' })
    const rootId = (await root.json()).doc.id
    await createComment(request, { ticket: ticketId, body: 'Reply one', parent: rootId })
    await createComment(request, { ticket: ticketId, body: 'Reply two', parent: rootId })

    const deleted = await request.delete(`/api/comments/${rootId}`)
    expect(deleted.ok()).toBeTruthy()

    const list = await request.get(`/api/comments?depth=0&where[ticket][equals]=${ticketId}`)
    expect((await list.json()).totalDocs).toBe(0)
  })

  test('deleting a ticket takes its comments with it', async ({ request }) => {
    const ticketId = await newTicket(request, 'Comments die with it')
    await createComment(request, { ticket: ticketId, body: 'Doomed' })

    const deleted = await request.delete(`/api/tickets/${ticketId}`)
    expect(deleted.ok()).toBeTruthy()

    const list = await request.get(`/api/comments?depth=0&where[ticket][equals]=${ticketId}`)
    expect((await list.json()).totalDocs).toBe(0)
  })

  test('deleting a person leaves their comments, authored by nobody', async ({ request }) => {
    const ticketId = await newTicket(request, 'Outlives its author')

    const temp = await request.post('/api/members', {
      data: { name: `Temp author ${refs.prefix}` },
    })
    const tempId = (await temp.json()).doc.id

    const created = await createComment(request, {
      ticket: ticketId,
      body: `written by @[Temp author ${refs.prefix}](member:${tempId})`,
      author: tempId,
    })
    const commentId = (await created.json()).doc.id

    expect((await request.delete(`/api/members/${tempId}`)).ok()).toBeTruthy()

    const after = await request.get(`/api/comments/${commentId}?depth=0`)
    expect(after.ok()).toBeTruthy()
    const doc = await after.json()
    expect(doc.body).toContain('written by')
    expect(doc.author).toBeFalsy()
    expect(doc.mentions ?? []).toEqual([])
  })
})

test.describe('comments in the UI', () => {
  test('posts a comment from the ticket page and renders its markdown', async ({
    page,
    request,
  }) => {
    const ticketId = await newTicket(request, 'UI comment target')
    await page.goto(`/tickets/${ticketId}`)

    await expect(page.getByRole('heading', { name: 'Comments' })).toBeVisible()
    await expect(page.getByText('No comments yet.')).toBeVisible()

    await page.getByRole('textbox', { name: 'Write a comment' }).fill('Ship **it** today')
    await page.getByRole('button', { name: 'Comment', exact: true }).click()

    const comment = page.locator('article[id^="comment-"]').first()
    await expect(comment).toBeVisible()
    await expect(comment.locator('strong')).toHaveText('it')
  })

  test('the empty composer explains itself instead of a dead button', async ({ page, request }) => {
    const ticketId = await newTicket(request, 'UI empty composer')
    await page.goto(`/tickets/${ticketId}`)

    const post = page.getByRole('button', { name: 'Comment', exact: true })
    await expect(post).toBeEnabled()
    await post.click()
    await expect(page.getByText('Write something before posting.')).toBeVisible()
  })

  test('@ opens the people picker and inserts a mention chip', async ({ page, request }) => {
    const ticketId = await newTicket(request, 'UI mention target')
    await page.goto(`/tickets/${ticketId}`)

    const composer = page.getByRole('textbox', { name: 'Write a comment' })
    await composer.click()
    await composer.type(`Hello @${memberName}`)

    const option = page.getByRole('option', { name: memberName })
    await expect(option).toBeVisible()
    await page.keyboard.press('Enter')

    await expect(composer).toHaveValue(new RegExp(`member:${memberId}`))

    await page.getByRole('button', { name: 'Comment', exact: true }).click()

    const chip = page.locator('.mention').first()
    await expect(chip).toHaveText(`@${memberName}`)
  })

  test('mod+Enter posts, and Escape closes the mention picker without inserting', async ({
    page,
    request,
  }) => {
    const ticketId = await newTicket(request, 'UI keyboard composer')
    await page.goto(`/tickets/${ticketId}`)

    const composer = page.getByRole('textbox', { name: 'Write a comment' })
    await composer.click()
    await composer.type('Nobody @Zzz')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('option')).toHaveCount(0)

    await composer.press('ControlOrMeta+Enter')
    await expect(page.locator('article[id^="comment-"]')).toHaveCount(1)
    await expect(composer).toHaveValue('')
  })

  test('the mention picker is operable from the keyboard alone', async ({ page, request }) => {
    const ticketId = await newTicket(request, 'UI keyboard mention')
    const other = await request.post('/api/members', {
      data: { name: `${memberName}Two`, team: refs.teamId },
    })
    const otherId = (await other.json()).doc.id

    await page.goto(`/tickets/${ticketId}`)

    const composer = page.getByRole('textbox', { name: 'Write a comment' })
    await composer.click()
    await composer.type(`@${memberName}`)

    const listbox = page.getByRole('listbox', { name: 'People you can mention' })
    await expect(listbox).toBeVisible()
    await expect(composer).toHaveAttribute('aria-controls', /./)

    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('option', { selected: true })).toHaveCount(1)
    await page.keyboard.press('Tab')

    await expect(composer).toHaveValue(new RegExp(`member:(${memberId}|${otherId})`))
    await expect(listbox).toHaveCount(0)
  })

  test('replies nest one level and a resolved thread collapses', async ({ page, request }) => {
    const ticketId = await newTicket(request, 'UI threading')
    const root = await createComment(request, { ticket: ticketId, body: 'Opening question' })
    const rootId = (await root.json()).doc.id

    await page.goto(`/tickets/${ticketId}`)

    await page.getByRole('button', { name: 'Reply' }).first().click()
    await page.getByRole('textbox', { name: 'Write a reply' }).fill('Answering it')
    await page.getByRole('button', { name: 'Reply', exact: true }).last().click()

    await expect(page.getByText('Answering it').first()).toBeVisible()

    await page
      .getByRole('button', { name: new RegExp('Actions for the comment') })
      .first()
      .click()
    const resolved = page.waitForResponse(
      (res) => res.request().method() === 'PATCH' && res.url().includes(`/api/comments/${rootId}`),
    )
    await page.getByRole('menuitem', { name: 'Resolve thread' }).click()
    expect((await resolved).ok()).toBeTruthy()

    await expect(page.getByText('Resolved', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Opening question')).toHaveCount(0)

    await page.getByRole('button', { name: /^Show 2 comments$/ }).click()
    await expect(page.getByText('Opening question').first()).toBeVisible()

    const stored = await request.get(`/api/comments/${rootId}?depth=0`)
    expect((await stored.json()).resolved).toBe(true)
  })

  test('deleting a comment asks first and says what goes with it', async ({ page, request }) => {
    const ticketId = await newTicket(request, 'UI delete')
    const root = await createComment(request, { ticket: ticketId, body: 'Delete me' })
    const rootId = (await root.json()).doc.id
    await createComment(request, { ticket: ticketId, body: 'A reply', parent: rootId })

    await page.goto(`/tickets/${ticketId}`)

    await page
      .getByRole('button', { name: new RegExp('Actions for the comment') })
      .first()
      .click()
    await page.getByRole('menuitem', { name: 'Delete comment and replies' }).click()

    await expect(page.getByText('Its 1 reply goes with it. This cannot be undone.')).toBeVisible()
    await page.getByRole('button', { name: 'Delete comment' }).click()

    await expect(page.getByText('No comments yet.')).toBeVisible()
  })

  test('the board peek panel carries the same comments', async ({ page, request }) => {
    const ticketId = await newTicket(request, 'UI peek comments')
    await createComment(request, { ticket: ticketId, body: 'Visible from the board' })

    await page.goto(`/board?project=${refs.projectId}&ticket=${ticketId}`)

    await expect(page.getByText('Visible from the board').first()).toBeVisible()
  })
})
