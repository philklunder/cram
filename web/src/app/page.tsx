import { redirect } from "next/navigation";

// The landing page lives at /home; "/" is just the door to it. Same in dev and production, so
// hitting localhost:3000 or the deployed origin always opens the landing page.
export default function Root() {
  redirect("/home");
}
