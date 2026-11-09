import type { SupabaseClient } from "@supabase/supabase-js";

export interface PackageWithCount {
  id: string;
  name: string;
  category: string | null;
  questionCount: number;
}

/** Load every question package with its question count (for the package selects). */
export async function loadPackagesWithCounts(sb: SupabaseClient): Promise<PackageWithCount[]> {
  const [{ data: pkgData }, { data: pqData }] = await Promise.all([
    sb.from("question_packages").select("id, name, category").order("name"),
    sb.from("package_questions").select("question_package_id"),
  ]);
  const counts = new Map<string, number>();
  for (const row of (pqData as { question_package_id: string }[]) ?? []) {
    counts.set(row.question_package_id, (counts.get(row.question_package_id) ?? 0) + 1);
  }
  return ((pkgData as { id: string; name: string; category: string | null }[]) ?? []).map((p) => ({
    ...p,
    questionCount: counts.get(p.id) ?? 0,
  }));
}
