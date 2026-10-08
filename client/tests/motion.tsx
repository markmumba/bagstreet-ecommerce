import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../src/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '../src/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../src/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../src/components/ui/tooltip';
import motionStyles from '../../shared/styles/motion.css?raw';
import '../src/index.css';

// Exercise the same reduced-motion rules without changing the tester's OS settings.
const reducedStyles = motionStyles.replace('@media (prefers-reduced-motion: reduce)', '@media all');

function MotionFixture() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <TooltipProvider>
      {reduceMotion && <style>{reducedStyles}</style>}
      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <h1 className="text-xl font-semibold">Motion regression fixture</h1>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} />
          Reduce motion
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild><Button>Open dialog</Button></DialogTrigger>
            <DialogContent>
              <DialogTitle>Product details</DialogTitle>
              <DialogDescription>Dialog motion fixture.</DialogDescription>
              <Button disabled>Disabled action</Button>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild><Button variant="outline">Open sheet</Button></SheetTrigger>
            <SheetContent>
              <SheetTitle>Order details</SheetTitle>
              <SheetDescription>Sheet motion fixture.</SheetDescription>
            </SheetContent>
          </Sheet>
          <div className="relative">
            <Button variant="outline" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>Toggle menu</Button>
            <div className="ui-menu absolute right-0 top-11 z-50 w-48 rounded-lg border bg-background p-2 shadow-lg" data-state={menuOpen ? 'open' : 'closed'} inert={!menuOpen}>
              <Button variant="ghost" className="w-full" onClick={() => setMenuOpen(false)}>Menu action</Button>
            </div>
          </div>
        </div>
        <Select defaultValue="all">
          <SelectTrigger aria-label="Order status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All orders</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="received">Received</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-3">
          {['First tooltip', 'Second tooltip'].map((label) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild><Button variant="outline">{label}</Button></TooltipTrigger>
              <TooltipContent>{label} content</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </main>
    </TooltipProvider>
  );
}

createRoot(document.getElementById('root')!).render(<MotionFixture />);
