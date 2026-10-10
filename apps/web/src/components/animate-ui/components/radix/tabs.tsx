import {
  TabsContent as TabsContentPrimitive,
  type TabsContentProps as TabsContentPrimitiveProps,
  TabsContents as TabsContentsPrimitive,
  type TabsContentsProps as TabsContentsPrimitiveProps,
  TabsHighlightItem as TabsHighlightItemPrimitive,
  TabsHighlight as TabsHighlightPrimitive,
  TabsList as TabsListPrimitive,
  type TabsListProps as TabsListPrimitiveProps,
  Tabs as TabsPrimitive,
  type TabsProps as TabsPrimitiveProps,
  TabsTrigger as TabsTriggerPrimitive,
  type TabsTriggerProps as TabsTriggerPrimitiveProps,
} from '@/components/animate-ui/primitives/radix/tabs';
import { cn } from '@/lib/utils';

type TabsProps = TabsPrimitiveProps;

function Tabs({ className, ...props }: TabsProps) {
  return <TabsPrimitive className={cn('flex flex-col gap-2', className)} {...props} />;
}

type TabsListProps = TabsListPrimitiveProps;

function TabsList({ className, ...props }: TabsListProps) {
  return (
    <TabsHighlightPrimitive className="absolute z-0 inset-0 rounded-md bg-hover">
      <TabsListPrimitive
        className={cn(
          'text-muted-foreground inline-flex w-fit items-center justify-center gap-0.5 rounded-md',
          className,
        )}
        {...props}
      />
    </TabsHighlightPrimitive>
  );
}

type TabsTriggerProps = TabsTriggerPrimitiveProps;

function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  return (
    <TabsHighlightItemPrimitive value={props.value} className="flex-1">
      <TabsTriggerPrimitive
        className={cn(
          "data-[state=active]:text-foreground hover:text-foreground text-muted-foreground inline-flex min-h-(--tap) flex-1 items-center justify-center gap-1.5 rounded-md w-full px-3.5 text-sm font-[550] whitespace-nowrap transition-colors duration-(--dur-fast) ease-std focus-visible:outline-offset-0 disabled:pointer-events-none disabled:text-faint [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className,
        )}
        {...props}
      />
    </TabsHighlightItemPrimitive>
  );
}

type TabsContentsProps = TabsContentsPrimitiveProps;

function TabsContents(props: TabsContentsProps) {
  return <TabsContentsPrimitive {...props} />;
}

type TabsContentProps = TabsContentPrimitiveProps;

function TabsContent({ className, ...props }: TabsContentProps) {
  return <TabsContentPrimitive className={cn('flex-1 outline-none', className)} {...props} />;
}

export {
  Tabs,
  TabsContent,
  type TabsContentProps,
  TabsContents,
  type TabsContentsProps,
  TabsList,
  type TabsListProps,
  type TabsProps,
  TabsTrigger,
  type TabsTriggerProps,
};
