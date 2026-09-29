import type { Fix } from "../rules/fixes";
import { useStore } from "../store";
import { Icon } from "./Icon";

export function FixButtons({ fixes }: { fixes: Fix[] }) {
  const applyFix = useStore((s) => s.applyFix);
  if (!fixes.length) return null;
  return (
    <div className="fixes">
      {fixes.map((f) => (
        <button key={f.label} className="fix-btn" onClick={() => applyFix(f)}>
          <Icon name="wrench" size={12} />
          {f.label}
        </button>
      ))}
    </div>
  );
}
