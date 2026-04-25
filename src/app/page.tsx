"use client";

import dynamic from "next/dynamic";

const DashboardClient = dynamic(() => import("./dashboard-client"), {
  ssr: false,
});

export default function Home() {
  return <DashboardClient />;
}
