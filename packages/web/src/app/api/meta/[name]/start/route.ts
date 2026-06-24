import { type NextRequest } from "next/server";
import { POST as _POST } from "@/app/api/orchestrators/[name]/start/route";

export async function POST(request: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  return _POST(request, ctx);
}
