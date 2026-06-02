import type { FC } from "react";
import type { AppStatus } from "../../shared/ipc-contract.ts";
import StatusDots from "./StatusDots.tsx";

export type ViewId = "search" | "queue" | "downloaded" | "repair" | "settings";

const ITEMS: Array<{ id: ViewId; label: string; icon: string }> = [
  { id: "search", label: "Suche", icon: "🔍" },
  { id: "queue", label: "Queue", icon: "📋" },
  { id: "downloaded", label: "Heruntergeladen", icon: "✅" },
  { id: "repair", label: "Reparatur", icon: "🔧" },
  { id: "settings", label: "Einstellungen", icon: "⚙️" },
];

export const Sidebar: FC<{
  active: ViewId;
  onSelect: (view: ViewId) => void;
  queueCount: number;
  status: AppStatus;
}> = ({ active, onSelect, queueCount, status }) => (
  <nav className="sidebar">
    <div className="brand">🎤 UltraStar</div>
    {ITEMS.map((item) => (
      <button
        key={item.id}
        type="button"
        className={`nav-item${active === item.id ? " active" : ""}`}
        onClick={() => onSelect(item.id)}
      >
        <span>{item.icon}</span>
        <span>{item.label}</span>
        {item.id === "queue" && queueCount > 0 && (
          <span className="badge">{queueCount}</span>
        )}
      </button>
    ))}
    <div className="spacer" />
    <StatusDots status={status} />
  </nav>
);

export default Sidebar;
