import { useEffect, useState } from "react";
import { ArrowLeft, XCircle } from "lucide-react";
import { Button, ErrorCard, Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { checkRnsLabel, formatRnsName } from "@repo/web3";
import { useEditor } from "@/contexts/EditorContext";
import { useDelayed } from "@/hooks/useDelayed";
import { useAuthbaseConfigured } from "@/hooks/rns/useAuthbaseConfigured";
import { useTransferOwnership } from "@/hooks/rns/useTransferOwnership";
import { RNS_FLAGS } from "@/config/rns/flags";
import { useRnsChain } from "../hooks";
import { useRnsRoute } from "../useRnsRoute";
import { NAME_VIEWS, type NameView } from "../route";
import { NameHeader } from "./NameHeader";
import { ProfileTab } from "./ProfileTab";
import { BannerDialog } from "./BannerDialog";
import { PublishFlow } from "./PublishFlow";
import { ExtendFlow } from "./ExtendFlow";
import { TransferFlow } from "./TransferFlow";
import { EMPTY_TRANSFER_DRAFT, type TransferDraft } from "./transferDraft";
import { useRnsName } from "./useRnsName";
import { usePublishDiff, type PendingBanner } from "./usePublishDiff";
import { IdentityTab } from "../identity/IdentityTab";
import { AttributesTab } from "../identity/AttributesTab";
import { FacetsTab } from "../identity/FacetsTab";
import { SoonPill } from "../identity/parts";

function BackToRns({ onBack }: { onBack: () => void }) {
  return (
    <Button type="button" variant="secondary" onClick={onBack}>
      <ArrowLeft aria-hidden />
      RNS
    </Button>
  );
}

function HeaderSkeleton() {
  return (
    <div aria-hidden className="space-y-[21px]">
      <div className="prism-glass-clear flex items-center gap-3 p-[21px]">
        <span className="h-commit w-commit rounded-prism-13 bg-prism-line motion-safe:animate-pulse" />
        <span className="flex-1 space-y-2">
          <span className="block h-6 w-56 rounded-full bg-prism-line motion-safe:animate-pulse" />
          <span className="block h-3.5 w-32 rounded-full bg-prism-line/70 motion-safe:animate-pulse" />
        </span>
      </div>
      <div className="prism-glass-clear h-[240px] motion-safe:animate-pulse" />
    </div>
  );
}

/**
 * Screen Review 102 to 106, 080, 111: the RNS name page as a URL view of the
 * Wallet RNS tab, /wallet?tab=rns&name=<label>&view=profile|identity|attributes|facets.
 * Attributes and Facets are Soon tabs shown to everyone (105 D1). Extend,
 * Transfer and Publish open in the value panel at &flow=. The page reads
 * without a wallet; each flow asks for one (I22).
 */
export function NamePage({ label }: { label: string }) {
  const route = useRnsRoute();
  if (checkRnsLabel(label)) return <InvalidName onBack={() => route.go({})} />;
  return <NamePageBody label={label} />;
}

/** 102 I19: anything that fails the name rule never reaches a chain read. */
function InvalidName({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-[21px] font-prism">
      <BackToRns onBack={onBack} />
      <div role="alert" className="prism-glass-clear flex items-start gap-3 p-[34px]">
        <XCircle aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-danger" />
        <div className="space-y-3">
          <h2 className="text-prism-panel-title text-prism-ink">Not a valid RNS name</h2>
          <p className="text-prism-body text-prism-ink-2">
            RNS names are 6 to 32 characters: letters, numbers and hyphens.
          </p>
          <Button type="button" variant="secondary" onClick={onBack}>
            Back to RNS
          </Button>
        </div>
      </div>
    </div>
  );
}

function NamePageBody({ label }: { label: string }) {
  const route = useRnsRoute();
  const chain = useRnsChain();
  const explorer = chain.blockExplorers?.default?.url;
  const { setActivePanelAndNavigate } = useEditor();
  const authbaseConfigured = useAuthbaseConfigured();
  const showIdentity = RNS_FLAGS.identity && authbaseConfigured;

  const name = useRnsName(label);
  const showSkeleton = useDelayed(name.status === "loading", 400);
  const [banner, setBanner] = useState<PendingBanner | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);
  const diff = usePublishDiff(name.records, name.isOwner ? banner : null);
  // The transfer outlives its panel, so closing mid transfer keeps the requests (080 I09)
  const transfer = useTransferOwnership();
  const [transferDraft, setTransferDraft] = useState<TransferDraft>(EMPTY_TRANSFER_DRAFT);

  const requested = route.view as NameView | null;
  const view: NameView =
    requested && NAME_VIEWS.includes(requested) && (requested === "profile" || showIdentity)
      ? requested
      : "profile";

  // 102 I19: a name nobody holds opens the register flow
  const { go } = route;
  useEffect(() => {
    if (name.status === "available") go({ flow: "register", name: label });
  }, [go, label, name.status]);

  // A new name resets the pending banner and transfer
  useEffect(() => {
    setBanner(null);
    setTransferDraft(EMPTY_TRANSFER_DRAFT);
  }, [label]);

  const back = () => route.go({});

  if (name.status === "failed") {
    return (
      <div className="space-y-[21px] font-prism">
        <BackToRns onBack={back} />
        <ErrorCard
          title="This RNS name did not load"
          cause="The network did not respond."
          onRetry={name.refetch}
          retryLabel="Retry"
          className="!rounded-prism-21"
        />
      </div>
    );
  }

  if (name.status !== "registered") {
    return (
      <div className="space-y-[21px] font-prism">
        <BackToRns onBack={back} />
        {showSkeleton && <HeaderSkeleton />}
      </div>
    );
  }

  const openIdentity = () => route.setView("identity");
  const closeFlow = () => route.setNameFlow(null);

  return (
    <div className="space-y-[21px] font-prism">
      <BackToRns onBack={back} />
      <NameHeader name={name} chainId={chain.id} onOpenIdentity={openIdentity} />

      <Tabs
        value={view}
        onValueChange={next => route.setView(next)}
        className="flex flex-col gap-[21px]"
      >
        {showIdentity && (
          <TabsList
            aria-label={`${formatRnsName(label, chain.id)} sections`}
            className="max-w-full self-start"
          >
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="identity">Identity</TabsTrigger>
            <TabsTrigger value="attributes" aria-label="Attributes, coming soon">
              Attributes
              <SoonPill />
            </TabsTrigger>
            <TabsTrigger value="facets" aria-label="Facets, coming soon">
              Facets
              <SoonPill />
            </TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="profile" className="mt-0">
          <ProfileTab
            name={name}
            chainId={chain.id}
            explorer={explorer}
            rows={diff.rows}
            banner={banner}
            transferring={transfer.overallStatus === "pending"}
            onChangeBanner={() => setBannerOpen(true)}
            onPublish={() => route.setNameFlow("publish")}
            onExtend={() => route.setNameFlow("extend")}
            onTransfer={() => route.setNameFlow("transfer")}
            onOpenIdentity={openIdentity}
          />
        </TabsContent>
        {showIdentity && (
          <>
            <TabsContent value="identity" className="mt-0">
              <IdentityTab name={name} chainId={chain.id} explorer={explorer} />
            </TabsContent>
            <TabsContent value="attributes" className="mt-0">
              <AttributesTab
                isOwner={name.isOwner}
                ownerVerified={name.verified}
                onOpenIdentity={openIdentity}
              />
            </TabsContent>
            <TabsContent value="facets" className="mt-0">
              <FacetsTab isOwner={name.isOwner} />
            </TabsContent>
          </>
        )}
      </Tabs>

      {name.isOwner && (
        <BannerDialog
          open={bannerOpen}
          onOpenChange={setBannerOpen}
          current={{
            url: banner ? banner.url : (name.records.banner ?? null),
            meta: banner ? banner.meta : name.records.bannerMeta,
          }}
          onDone={setBanner}
        />
      )}
      {route.nameFlow === "publish" && (
        <PublishFlow
          name={name}
          chainId={chain.id}
          rows={diff.rows}
          banner={banner}
          onClose={closeFlow}
          onPublished={() => {
            setBanner(null);
            name.refetch();
          }}
        />
      )}
      {route.nameFlow === "extend" && (
        <ExtendFlow name={name} chainId={chain.id} onClose={closeFlow} onExtended={name.refetch} />
      )}
      {route.nameFlow === "transfer" && (
        <TransferFlow
          name={name}
          chainId={chain.id}
          transfer={transfer}
          draft={transferDraft}
          setDraft={setTransferDraft}
          onClose={() => {
            if (transferDraft.step === "result") {
              setTransferDraft(EMPTY_TRANSFER_DRAFT);
              transfer.resetSteps();
            }
            closeFlow();
          }}
          onTransferred={name.refetch}
          onChooseAnother={() => setActivePanelAndNavigate("page")}
        />
      )}
    </div>
  );
}
