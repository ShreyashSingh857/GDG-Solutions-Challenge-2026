import { Skeleton } from './Skeleton';

export function PanelSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" className="w-10 h-10" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="line" className="w-[60%]" />
          <Skeleton variant="line" className="w-[40%]" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton variant="block" className="h-24" />
        <Skeleton variant="line" />
        <Skeleton variant="line" />
        <Skeleton variant="line" className="w-[80%]" />
      </div>
      <div className="pt-4 flex gap-2">
        <Skeleton variant="line" className="h-8 w-24 rounded-lg" />
        <Skeleton variant="line" className="h-8 w-24 rounded-lg" />
      </div>
    </div>
  );
}
