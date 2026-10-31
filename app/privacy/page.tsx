import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — MicroNest",
  description: "How MicroNest handles your account and client data.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <nav aria-label="Breadcrumb">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          ← Home
        </Link>
      </nav>
      <section className="flex flex-col gap-1.5">
        <p className="eyebrow">Legal</p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="text-xs text-stone-500">Last updated: October 2026</p>
      </section>
      <section className="flex flex-col gap-3 text-sm leading-relaxed text-stone-700">
        <h2 className="text-base font-semibold text-stone-900">What MicroNest stores</h2>
        <p>
          MicroNest stores only what you enter: your clients&apos; names, phone numbers,
          relationship dates, notes, and follow-ups. Your data is stored in a Postgres database
          (Supabase) and is strictly private to your signed-in account — database rules
          (row-level security) ensure one account can never read another account&apos;s rows.
        </p>
        <h2 className="text-base font-semibold text-stone-900">Sign-in</h2>
        <p>
          Sign-in uses Google OAuth via Supabase Auth. MicroNest receives your email address and
          display name for sign-in only. There are no passwords stored by MicroNest.
        </p>
        <h2 className="text-base font-semibold text-stone-900">What is never stored or shared</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Your client data is never sold and never shared with third parties.</li>
          <li>Your client data is never used to train AI models.</li>
          <li>
            The Messages tool runs entirely on your device: nothing you type there is uploaded,
            stored, or tracked.
          </li>
          <li>
            Notes and uploads are screened on your device for sensitive patterns (such as ID
            numbers, bank details, OTPs, and passwords) and rejected before anything is saved.
            Do not enter such details anywhere in MicroNest.
          </li>
        </ul>
        <h2 className="text-base font-semibold text-stone-900">Analytics</h2>
        <p>
          MicroNest collects anonymous page views and Web Vitals (via Vercel Analytics) plus
          aggregate performance counts (for example, how many rows an import contained). These
          measurements never include client names, phone numbers, notes, amounts, or any other
          client content, and they never identify your account.
        </p>
        <h2 className="text-base font-semibold text-stone-900">Deletion</h2>
        <p>
          You can permanently delete all of your clients and follow-ups at any time from your
          account menu (Delete account and data). Deletion removes your rows from the database
          immediately; there is no recovery and no retained copy.
        </p>
        <h2 className="text-base font-semibold text-stone-900">Contact</h2>
        <p>
          Questions about this policy: see <Link href="/support" className="font-medium text-emerald-900 hover:underline">Support</Link>.
        </p>
      </section>
    </div>
  );
}
