import { useEffect, useRef, useState } from "react";
import { ChipGroup, ParticlesLayer, ShaderLayer } from "@repo/ui";
import { EffectVideo, effectVideoSrc } from "../kit/EffectVideo";
import { isFeatureOn } from "../../../../config/featureFlags";
import { DisclosureRow } from "../kit/DisclosureRow";
import { OptionGrid, OptionTile } from "../kit/OptionTile";
import { CreatorBackdrop } from "../kit/CreatorArt";
import { useDesign } from "../kit/useDesign";
import { ParamPanel } from "../kit/ParamStrip";
import {
  SCENE_FILTERS,
  SCENE_FILTER_LABELS,
  SCENE_TILES,
  filterScenes,
  isShaderTile,
  sceneTilesFor,
  sceneIndex,
  scenePatch,
  type SceneFilter,
  type SceneTile,
} from "../kit/sceneLook";

// Theme Engine v2 phase 2, Scene row (board 01, decision 4). Behind
// VITE_SHOW_THEME_V2; the v1 Particles row stays in MotionRows.tsx. Tiles draw
// with the page's own particle layer (tsParticles v4), still until hovered,
// focused or tapped, one live tile at a time (029 I02, decision 12).
// Phase 3b: shader tiles paint their poster. Phase 3g: while live they play
// their build time video (kit/EffectVideo.tsx), so the row opens no WebGL
// context; a shader with no video yet runs live, one at a time.
// TE-3b, TE-3f: shader scenes and Showcase scenes join the grid with the flag
const showcaseOn = isFeatureOn("themeShowcase");
const TILES = sceneTilesFor(showcaseOn);

function SceneTileView({
  tile,
  selected,
  focusable,
  live,
  onLive,
}: {
  tile: SceneTile;
  selected: boolean;
  focusable: boolean;
  live: boolean;
  onLive: (key: string | null) => void;
}) {
  const { config, values, locked, update, preview, endPreview } = useDesign();
  const [videoFailed, setVideoFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const key = tile.effectId ?? String(tile.id);
  const colors = {
    button: values.buttonColor,
    buttonText: values.fontColor,
    container: values.containerColor,
    text: values.fontColor,
  };
  return (
    <OptionTile
      label={tile.entry.label}
      description={tile.entry.description}
      tier={tile.entry.tier}
      cost={tile.entry.cost}
      selected={selected}
      focusable={focusable}
      disabled={locked}
      onSelect={() => {
        update(scenePatch(tile));
        // On tap the tile runs for 3 seconds (029 I02)
        onLive(key);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onLive(null), 3000);
      }}
      onPreview={() => {
        preview(scenePatch(tile));
        onLive(key);
      }}
      onPreviewEnd={() => {
        endPreview();
        onLive(null);
      }}
      art={
        <CreatorBackdrop background={config.background}>
          {isShaderTile(tile) ? (
            <>
              <ShaderLayer
                entry={tile.entry}
                colors={colors}
                showcase={showcaseOn && (!effectVideoSrc(tile.entry.id) || videoFailed)}
                paused={!live}
                device="typical"
              />
              <EffectVideo
                id={tile.entry.id}
                playing={live}
                onUnavailable={() => setVideoFailed(true)}
              />
            </>
          ) : (
            tile.entry.id !== "scene.none" && (
              <ParticlesLayer entry={tile.entry} colors={colors} paused={!live} />
            )
          )}
        </CreatorBackdrop>
      }
    />
  );
}

export function SceneRow() {
  const { config, values, locked, update, yourColors } = useDesign();
  const [filter, setFilter] = useState<SceneFilter>("all");
  // One live tile at most (029 I02)
  const [live, setLive] = useState<string | null>(null);
  const selectedIndex = sceneIndex(values.particlesEffect, config.particlesEffectId);
  const selected = SCENE_TILES[selectedIndex];
  const shown = filterScenes(TILES, filter);
  const firstFocusable = shown.some(t => t === selected) ? selected : shown[0];
  return (
    <DisclosureRow id="particles" label="Scene" value={selected?.entry.label ?? "None"}>
      <div className="space-y-[21px]">
        <div className="space-y-2">
          <p className="text-prism-label font-semibold text-prism-ink">Show</p>
          <ChipGroup
            label="Show scenes"
            value={filter}
            onChange={setFilter}
            options={SCENE_FILTERS.map(value => ({ value, label: SCENE_FILTER_LABELS[value] }))}
          />
        </div>
        <OptionGrid label="Scene">
          {shown.map(tile => (
            <SceneTileView
              key={tile.effectId ?? tile.id}
              tile={tile}
              selected={tile === selected}
              focusable={tile === firstFocusable}
              live={live === (tile.effectId ?? String(tile.id))}
              onLive={setLive}
            />
          ))}
        </OptionGrid>
        {selected && selected.entry.id !== "scene.none" && (
          <ParamPanel
            entry={selected.entry}
            stored={config.particlesParams}
            disabled={locked}
            yourColors={yourColors}
            onChange={params => update({ particlesParams: params })}
          />
        )}
        {filter === "shaders" && !showcaseOn && (
          <p className="text-prism-meta text-prism-ink-2">
            No shader scenes yet. They arrive with the Showcase effects.
          </p>
        )}
        {isShaderTile(selected) && (
          <p className="text-prism-meta text-prism-ink-2">
            {selected!.entry.label} replaces your background while it plays. Pause motion, reduced
            motion and phones that cannot run it see a still version of the scene instead.
            {selected!.entry.pointer === "fine" &&
              " It follows the pointer on computers. On phones it plays without the pointer."}
          </p>
        )}
        <p className="text-prism-meta text-prism-ink-2">
          Scenes play behind your page. Visitors can pause them, and visitors with reduced motion
          see a still version.
        </p>
      </div>
    </DisclosureRow>
  );
}
