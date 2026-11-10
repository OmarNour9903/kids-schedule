import { requireSession } from "../session.js";
import { renderNav } from "../nav.js";
import { revealPage } from "../ui.js";
import { ROLE_LABELS } from "../strings.js";

const session = await requireSession();
renderNav(session);

const { member } = session;
document.getElementById("welcome-name").textContent = member.name;
document.getElementById("welcome-role").textContent = ROLE_LABELS[member.role];

// كل عنصر عليه data-show-for بيظهر للأدوار المكتوبة فيه بس
document.querySelectorAll("[data-show-for]").forEach((el) => {
  const roles = el.dataset.showFor.split(" ");
  el.classList.toggle("d-none", !roles.includes(member.role));
});

revealPage();
