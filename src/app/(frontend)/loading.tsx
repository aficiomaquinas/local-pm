import { CardSkeletonList } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-[104px] flex-none border-b border-border-subtle" />
      <div className="flex flex-1 gap-4 overflow-hidden p-6">
        {[0, 1, 2].map((column) => (
          <div
            key={column}
            className="flex w-72 shrink-0 flex-col rounded-md border border-border-subtle bg-bg-subtle"
          >
            <div className="h-10 flex-none border-b border-border-subtle" />
            <div className="p-3">
              <CardSkeletonList count={3} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
