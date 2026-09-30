import { useState } from "react";
import { Bell, Copy, FolderOpen, LogOut, Search, Settings, Share2, Trash2 } from "lucide-react";
import {
  Badge,
  BottomSheet,
  BottomSheetContent,
  BottomSheetTrigger,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChipGroup,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  ErrorCard,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Notice,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TESTNET_NOTICE,
  Textarea,
  ToastCard,
  Tooltip,
} from "@repo/ui";
import { toast as hotToast } from "react-hot-toast";
import { toast } from "@/components/ui/toast";

// Internal gallery of the Prism 2.2 shared components (docs/PRISM.md).
// Reachable only at /_prism for signed-in users. It is not linked anywhere.

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-5">
      <h2 id={id} className="font-prism-display text-prism-display-42 uppercase text-prism-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-prism-eyebrow uppercase text-prism-ink-3">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export function PrismGallery() {
  const [range, setRange] = useState<"7d" | "28d" | "90d">("28d");
  const [enabled, setEnabled] = useState(true);

  return (
    <div className="prism-room prism-font min-h-screen text-prism-ink">
      <main className="mx-auto max-w-[1080px] space-y-14 px-4 py-12 sm:px-8">
        <header className="space-y-3">
          <h1 className="font-prism-display text-prism-display-68 uppercase">
            Prism 2.2 components
          </h1>
          <p className="max-w-[62ch] text-prism-body text-prism-ink-2">
            Every shared component, restyled in place. Anything that uses these through @repo/ui
            picks up the same look. Tokens and rules are in docs/PRISM.md.
          </p>
        </header>

        <Section id="buttons" title="Buttons">
          <Row label="Variants">
            <Button>Continue</Button>
            <Button variant="commit">Stake 250 tREVO</Button>
            <Button variant="secondary">View page</Button>
            <Button variant="ghost">Clear search</Button>
            <Button variant="link">Learn more</Button>
            <Button variant="destructive">Delete account</Button>
          </Row>
          <Row label="Sizes and states">
            <Button size="lg">Review stake</Button>
            <Button size="sm" variant="secondary">
              <Copy /> Copy
            </Button>
            <Button size="icon" variant="secondary" aria-label="Share">
              <Share2 />
            </Button>
            <Button disabled>Disabled</Button>
          </Row>
          <p className="text-prism-meta text-prism-ink-2">
            You confirm in your wallet next. Nothing moves until you sign.
          </p>
        </Section>

        <Section id="chips" title="Chips and tabs">
          <Row label="Chip group (radio, arrow keys)">
            <ChipGroup
              label="Period"
              value={range}
              onChange={setRange}
              options={[
                { value: "7d", label: "7 days" },
                { value: "28d", label: "28 days" },
                { value: "90d", label: "90 days" },
              ]}
            />
          </Row>
          <Tabs defaultValue="overview">
            <TabsList aria-label="Analytics sections">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="audience">Audience</TabsTrigger>
              <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="text-prism-body text-prism-ink-2">
              Overview content.
            </TabsContent>
            <TabsContent value="audience" className="text-prism-body text-prism-ink-2">
              Audience content.
            </TabsContent>
            <TabsContent value="campaigns" className="text-prism-body text-prism-ink-2">
              Campaigns content.
            </TabsContent>
          </Tabs>
          <Row label="Badges">
            <Badge>Selected</Badge>
            <Badge variant="secondary">Music</Badge>
            <Badge variant="success">Verified</Badge>
            <Badge variant="warning">Testnet</Badge>
            <Badge variant="outline">Draft</Badge>
            <Badge variant="destructive">Suspended</Badge>
          </Row>
        </Section>

        <Section id="forms" title="Forms">
          <div className="grid gap-6 sm:grid-cols-2">
            <Input
              label="Display name"
              placeholder="Your name"
              helper="Shown at the top of your page."
            />
            <Input
              label="Handle"
              leftText="@"
              defaultValue="rob!"
              error="Use letters, numbers, hyphens or underscores."
            />
            <Textarea label="Bio" placeholder="Tell fans who you are" />
            <div className="space-y-2">
              <p className="font-prism text-prism-label font-semibold">Category</p>
              <Select defaultValue="music">
                <SelectTrigger aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="music">Music</SelectItem>
                  <SelectItem value="sports">Sports</SelectItem>
                  <SelectItem value="gaming">Gaming</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Switch checked={enabled} onChange={setEnabled} label="Show my pool on my page" />
            <div className="flex items-center">
              <Tooltip content="Copies the address to your clipboard">
                <Button variant="secondary">Hover for tooltip</Button>
              </Tooltip>
            </div>
          </div>
        </Section>

        <Section id="overlays" title="Dialog, sheet, menu">
          <Row label="Open one">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Open dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Rename link</DialogTitle>
                  <DialogDescription>Visitors see this label on your page.</DialogDescription>
                </DialogHeader>
                <Input label="Label" defaultValue="My new single" />
                <DialogFooter>
                  <Button variant="secondary">Cancel</Button>
                  <Button>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <BottomSheet>
              <BottomSheetTrigger asChild>
                <Button variant="secondary">Open bottom sheet</Button>
              </BottomSheetTrigger>
              <BottomSheetContent title="More">
                <ul className="divide-y divide-prism-line">
                  {["Explore", "Analytics", "My Pool"].map(item => (
                    <li key={item} className="flex min-h-commit items-center text-prism-label">
                      {item}
                    </li>
                  ))}
                </ul>
              </BottomSheetContent>
            </BottomSheet>

            <Menu>
              <MenuTrigger asChild>
                <Button variant="secondary">Open menu</Button>
              </MenuTrigger>
              <MenuContent align="start">
                <MenuLabel>Account</MenuLabel>
                <MenuItem>
                  <Settings /> Settings
                </MenuItem>
                <MenuItem>
                  <Bell /> Notifications
                </MenuItem>
                <MenuSeparator />
                <MenuItem destructive>
                  <LogOut /> Sign out
                </MenuItem>
              </MenuContent>
            </Menu>
          </Row>
        </Section>

        <Section id="feedback" title="Toasts and notices">
          <Row label="Toast cards">
            <div className="grid w-full gap-3 sm:grid-cols-2">
              <ToastCard
                type="success"
                title="Link added"
                action={{ label: "Undo", onClick: () => {} }}
                onDismiss={() => {}}
              />
              <ToastCard
                type="error"
                title="Could not save"
                description="Check your connection and try again."
                onDismiss={() => {}}
              />
              <ToastCard type="info" title="Copied to clipboard" />
              <ToastCard type="loading" title="Uploading image" />
            </div>
          </Row>
          <Row label="Live toasts (one stack, bottom left)">
            <Button
              variant="secondary"
              onClick={() => toast.add({ type: "success", title: "Saved to your page" })}
            >
              App toast
            </Button>
            <Button variant="secondary" onClick={() => hotToast.error("Pools did not load")}>
              react-hot-toast error
            </Button>
          </Row>
          <div className="grid gap-3 sm:grid-cols-2">
            <Notice variant="info" title="Heads up">
              Your page updates as soon as you save.
            </Notice>
            <Notice variant="success" title="Wallet connected" />
            <Notice variant="warning" title="Testnet">
              {TESTNET_NOTICE}
            </Notice>
            <Notice variant="error" title="Name not available">
              Someone registered this name a moment ago.
            </Notice>
          </div>
        </Section>

        <Section id="states" title="Loading, empty, error">
          <div className="grid gap-6 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Skeleton</CardTitle>
                <CardDescription>Shows after 400ms, matches the final layout.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-touch" />
                <Skeleton className="h-touch w-2/3" />
                <Skeleton className="h-[110px] rounded-prism-21" delayMs={400} />
              </CardContent>
            </Card>
            <Card>
              <EmptyState
                icon={FolderOpen}
                title="No blocks yet"
                description="Add a link so fans have somewhere to go."
                action={<Button>Add your first block</Button>}
              />
            </Card>
            <div className="space-y-3">
              <EmptyState
                icon={Search}
                title="No people match 'sam'"
                action={<Button variant="ghost">Clear search</Button>}
              />
              <ErrorCard
                title="Pools did not load"
                cause="The network did not answer."
                onRetry={() => {}}
              />
            </div>
          </div>
        </Section>

        <Section id="materials" title="Materials">
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="prism-glass-clear p-5 text-prism-body">G1 clear</div>
            <div className="prism-glass-nav rounded-prism-34 p-5 text-prism-body">G1 navigate</div>
            <div className="prism-well flex items-center px-3 text-prism-body">G2 well</div>
            <div className="prism-lens p-5 text-prism-body">
              <span aria-hidden className="prism-halo-card" />
              <span aria-hidden className="prism-rim" />
              G3 lens with rim and halo
            </div>
            <div className="prism-value-panel p-8 text-prism-body">G3 value panel</div>
            <div className="prism-value-panel-calm p-8 text-prism-body">
              G3 calm (commit state)
              <div className="prism-slab mt-3 px-4 py-3 text-prism-meta">G2 slab</div>
            </div>
          </div>
          <Row label="Destructive in a menu row">
            <Button variant="ghost">
              <Trash2 /> Remove block
            </Button>
          </Row>
        </Section>
      </main>
    </div>
  );
}
