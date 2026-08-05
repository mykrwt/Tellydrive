import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";

export default async function Home() {
  redirect((await getSessionUserId()) ? "/dashboard" : "/sign-in");
}
