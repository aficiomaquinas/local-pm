import { describe, expect, it } from 'vitest'
import {
  attachmentMarkdown,
  formatBytes,
  isImage,
  MAX_ATTACHMENT_BYTES,
  rejectionReason,
  uploadPlaceholder,
} from '@/lib/attachments'
import { insertBlock, replaceRange } from '@/lib/markdown-edit'

const png = {
  id: 'a1',
  url: '/api/attachments/file/shot.png',
  filename: 'shot.png',
  mimeType: 'image/png',
  filesize: 2048,
}

describe('formatBytes', () => {
  it('reads sizes in the nearest unit', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB')
  })
})

describe('attachmentMarkdown', () => {
  it('embeds an image', () => {
    expect(attachmentMarkdown(png)).toBe('![shot.png](/api/attachments/file/shot.png)')
  })

  it('links anything else', () => {
    expect(
      attachmentMarkdown({
        ...png,
        url: '/api/attachments/file/notes.pdf',
        filename: 'notes.pdf',
        mimeType: 'application/pdf',
      }),
    ).toBe('[notes.pdf](/api/attachments/file/notes.pdf)')
  })

  it('strips brackets out of the label so the link survives', () => {
    expect(attachmentMarkdown({ ...png, filename: 'a[1].png' })).toBe(
      '![a 1 .png](/api/attachments/file/shot.png)',
    )
  })
})

describe('isImage', () => {
  it('recognises image types only', () => {
    expect(isImage('image/webp')).toBe(true)
    expect(isImage('application/pdf')).toBe(false)
    expect(isImage(null)).toBe(false)
  })
})

describe('rejectionReason', () => {
  it('accepts an image under the limit', () => {
    expect(rejectionReason({ name: 'a.png', size: 1024, type: 'image/png' })).toBeNull()
  })

  it('names the size when the file is too big', () => {
    const reason = rejectionReason({
      name: 'big.png',
      size: MAX_ATTACHMENT_BYTES + 1,
      type: 'image/png',
    })
    expect(reason).toContain('big.png')
    expect(reason).toContain('10 MB')
  })

  it('turns away a type the app does not take', () => {
    expect(rejectionReason({ name: 'a.exe', size: 10, type: 'application/x-msdownload' })).toContain(
      'not a file type',
    )
  })
})

describe('uploadPlaceholder', () => {
  it('is unique per upload and marks images', () => {
    expect(uploadPlaceholder('t1', 'shot.png', true)).toBe('![Uploading shot.png…](upload:t1)')
    expect(uploadPlaceholder('t2', 'notes.pdf', false)).toBe('[Uploading notes.pdf…](upload:t2)')
  })
})

describe('insertBlock', () => {
  it('opens a line before the block when the caret sits mid-text', () => {
    expect(insertBlock('note', 4, 4, '```\ncode\n```').text).toBe('note\n```\ncode\n```\n')
  })
})

describe('replaceRange', () => {
  it('swaps the selection and leaves the caret after it', () => {
    const result = replaceRange('hello world', 6, 11, 'there')
    expect(result.text).toBe('hello there')
    expect(result.start).toBe(11)
  })
})

describe('attachmentMarkdown with a renamed file', () => {
  it('keeps the name the user dropped even when the server renamed the file', () => {
    expect(
      attachmentMarkdown(
        {
          id: 'a2',
          url: '/api/attachments/file/shot-1.png',
          filename: 'shot-1.png',
          mimeType: 'image/png',
          filesize: 10,
        },
        'shot.png',
      ),
    ).toBe('![shot.png](/api/attachments/file/shot-1.png)')
  })
})
