import { redirect } from "next/navigation";

// The app entry point routes straight to the subjects list; the (app) layout handles the
// auth gate and bounces unauthenticated users to /login.
export default function Home() {
  redirect("/subjects");
}
