// The single renderer for the animated stretch figures. Everything it draws
// comes from the pure geometry in lib/stretchPoses.ts, so adding a drill never
// touches this file.
//
// Motion is CSS-only (keyframes live in app/globals.css) — no JS ticking, no
// canvas, nothing to keep in sync with the countdown. Rotations pivot via
// nested translate groups rather than `transform-origin`, which keeps the
// origin in user-space coordinates on every browser without relying on
// `transform-box`. The figure inherits `currentColor`, so the player can tint
// it with the step's modality color for free.

import {
  POSES,
  type PoseDef,
  type PoseFrame,
  type PoseProp,
  type Pt,
  type StretchPose,
} from "@/lib/stretchPoses";

const VB_W = 120;
const VB_H = 100;
const FLOOR_Y = 92;

function pts(p: Pt[]): string {
  return p.map(([x, y]) => `${x},${y}`).join(" ");
}

// Rotate `children` about a point in view-box coordinates.
function Pivot({
  at: [x, y],
  className,
  children,
}: {
  at: Pt;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className}>
        <g transform={`translate(${-x} ${-y})`}>{children}</g>
      </g>
    </g>
  );
}

function Limb({ points }: { points: [Pt, Pt, Pt] }) {
  return <polyline points={pts(points)} />;
}

function Frame({
  frame,
  def,
  className,
}: {
  frame: PoseFrame;
  def: PoseDef;
  className?: string;
}) {
  const { head, headR = 6.5, neck, hip, spineCtl } = frame;
  const spine = spineCtl
    ? `M${neck[0]} ${neck[1]} Q${spineCtl[0]} ${spineCtl[1]} ${hip[0]} ${hip[1]}`
    : `M${neck[0]} ${neck[1]} L${hip[0]} ${hip[1]}`;

  // A limb that spins or swings gets wrapped in a pivot at its root joint.
  const limb = (key: "armA" | "armB" | "legA" | "legB") => {
    const l = frame[key];
    if (!l) return null;
    const spins = key.startsWith("arm") && def.spin?.includes(key as "armA" | "armB");
    const swings = key.startsWith("leg") && def.swing?.includes(key as "legA" | "legB");
    const node = <Limb points={l} />;
    if (spins) {
      return (
        <Pivot key={key} at={l[0]} className="sl-fig-spin">
          {node}
        </Pivot>
      );
    }
    if (swings) {
      return (
        <Pivot key={key} at={l[0]} className="sl-fig-swing">
          {node}
        </Pivot>
      );
    }
    return <g key={key}>{node}</g>;
  };

  // The stick prop rides the hands of whichever frame is showing.
  const bar =
    def.props?.some((p) => p.kind === "handbar") && frame.armA && frame.armB ? (
      <line
        x1={frame.armA[2][0]}
        y1={frame.armA[2][1]}
        x2={frame.armB[2][0]}
        y2={frame.armB[2][1]}
        className="sl-fig-bar"
      />
    ) : null;

  return (
    <g className={className}>
      {/* far-side limbs sit behind the torso for a hint of depth */}
      <g opacity="0.45">{limb("armB")}</g>
      <g opacity="0.45">{limb("legB")}</g>
      <circle cx={head[0]} cy={head[1]} r={headR} />
      <path d={spine} />
      {limb("armA")}
      {limb("legA")}
      {bar}
    </g>
  );
}

function Prop({ prop }: { prop: PoseProp }) {
  switch (prop.kind) {
    case "floor":
      return (
        <line
          x1={4}
          y1={FLOOR_Y}
          x2={VB_W - 4}
          y2={FLOOR_Y}
          className="sl-fig-prop"
          strokeDasharray="3 4"
        />
      );
    case "wall":
      return (
        <line
          x1={prop.x}
          y1={6}
          x2={prop.x}
          y2={FLOOR_Y}
          className="sl-fig-prop"
          strokeDasharray="3 4"
        />
      );
    case "roller":
      return (
        <circle
          cx={prop.at[0]}
          cy={prop.at[1]}
          r={prop.r ?? 7}
          className="sl-fig-prop"
          fill="none"
        />
      );
    case "handbar":
      // Drawn per-frame from the hand positions, not here.
      return null;
  }
}

export default function StretchFigure({
  pose,
  mirror = false,
  size = 160,
  color,
  animate = true,
  className,
}: {
  pose: StretchPose;
  /** Flip horizontally — used so the right-side rep visibly mirrors the left. */
  mirror?: boolean;
  size?: number;
  /** Any CSS color; the figure strokes inherit it. Defaults to currentColor. */
  color?: string;
  animate?: boolean;
  className?: string;
}) {
  const def = POSES[pose];
  const twoFrame = def.frames.length === 2;

  const body = (
    <>
      {def.frames[0] && (
        <Frame
          frame={def.frames[0]}
          def={def}
          className={twoFrame ? "sl-fig-frame-a" : undefined}
        />
      )}
      {twoFrame && def.frames[1] && (
        <Frame frame={def.frames[1]} def={def} className="sl-fig-frame-b" />
      )}
    </>
  );

  const motionClass = def.motion ? `sl-fig-${def.motion}` : null;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={size}
      height={(size * VB_H) / VB_W}
      className={`sl-fig${animate ? "" : " sl-fig-still"}${className ? ` ${className}` : ""}`}
      style={color ? { color } : undefined}
      role="img"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={3.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {def.props?.map((p, i) => (
        <Prop key={i} prop={p} />
      ))}
      <g transform={mirror ? `translate(${VB_W} 0) scale(-1 1)` : undefined}>
        {motionClass ? (
          <Pivot at={[VB_W / 2, FLOOR_Y]} className={motionClass}>
            {body}
          </Pivot>
        ) : (
          body
        )}
      </g>
    </svg>
  );
}
