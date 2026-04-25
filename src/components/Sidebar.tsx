"use client";

type SidebarItem = {
  id: string;
  label: string;
};

type SidebarProps = {
  items: SidebarItem[];
  active: string;
  onSelect: (id: string) => void;
  children?: React.ReactNode;
};

export function Sidebar({ items, active, onSelect, children }: SidebarProps) {
  return (
    <aside className="space-y-5">
      <nav className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`w-full rounded-lg px-4 py-2 text-left text-sm font-medium transition ${
              active === item.id ? "bg-emerald-50 text-primary" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {children}
    </aside>
  );
}
