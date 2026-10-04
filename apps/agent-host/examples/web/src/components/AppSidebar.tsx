import type { JSX } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarTrigger,
} from "./ui/sidebar";
import { SidebarNavigation } from "./SidebarNavigation";

export default function AppSidebar(): JSX.Element {
  return (
    <Sidebar aria-label="Main navigation">
      <SidebarHeader>
        <img
          src="https://imagedelivery.net/HqFoVJao5LE850LIcBfxAQ/3f767dfc-8267-475e-fc66-642783920400/public"
          alt="Agent host"
          className="w-52 px-3 py-1"
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarNavigation />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarTrigger />
      </SidebarFooter>
    </Sidebar>
  );
}
