import { NextResponse } from "next/server";
import { getMissingLeadsEnvVars, hasResendLeadConfig } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET() {
  const missingEnvVars = getMissingLeadsEnvVars();
  const resendConfigured = hasResendLeadConfig();

  if (missingEnvVars.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Missing required environment variables for lead capture",
        missingEnvVars,
        resendConfigured,
      },
      { status: 500 },
    );
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("audit_leads").select("id").limit(1);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: "Supabase is configured but table query failed",
          details: error.message,
          resendConfigured,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Lead capture integration is healthy",
      resendConfigured,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Unexpected health-check error",
        resendConfigured,
      },
      { status: 500 },
    );
  }
}

