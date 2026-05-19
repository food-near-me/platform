import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Verify Menu | foodnear.me",
  description: "Human-in-the-loop menu verification to ensure allergen and pricing accuracy.",
};

export default function VerifyMenuPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Verify Extracted Menu</h1>
          <p className="text-sm text-zinc-500">
            Please review the extracted data against your original menu. You must explicitly approve the dietary tags and prices.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard" className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Cancel
          </Link>
          <button className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            Sign & Approve Menu
          </button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Side: Original Source (PDF/Image) */}
        <section className="flex flex-col rounded-xl border border-zinc-200 bg-zinc-50 overflow-hidden">
          <div className="border-b border-zinc-200 bg-white px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-700">Original Source (PDF)</h2>
          </div>
          <div className="flex-1 p-4 flex items-center justify-center">
            {/* Placeholder for PDF Viewer */}
            <div className="text-center text-zinc-400">
              <p className="mb-2">[PDF Viewer Placeholder]</p>
              <p className="text-xs">The uploaded menu file will be displayed here for side-by-side comparison.</p>
            </div>
          </div>
        </section>

        {/* Right Side: Extracted JSON / Form */}
        <section className="flex flex-col rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="border-b border-zinc-200 px-4 py-3 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-zinc-700">Extracted Menu Protocol Data</h2>
            <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
              Pending Verification
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Mock Category */}
            <div className="space-y-4">
              <h3 className="font-medium text-lg border-b pb-2">Main Courses</h3>
              
              {/* Mock Item */}
              <div className="rounded-lg border border-zinc-200 p-4 space-y-3">
                <div className="flex justify-between">
                  <input type="text" defaultValue="Margherita Pizza" className="font-medium text-zinc-900 border-zinc-300 rounded-md shadow-sm focus:border-black focus:ring-black sm:text-sm" />
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-500">$</span>
                    <input type="number" defaultValue="14.99" className="w-20 border-zinc-300 rounded-md shadow-sm focus:border-black focus:ring-black sm:text-sm" />
                  </div>
                </div>
                
                <textarea 
                  defaultValue="Fresh mozzarella, San Marzano tomatoes, basil" 
                  className="w-full text-sm text-zinc-600 border-zinc-300 rounded-md shadow-sm focus:border-black focus:ring-black"
                  rows={2}
                />
                
                <div className="pt-2 border-t border-zinc-100">
                  <p className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">Dietary & Allergens (Requires Review)</p>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-xs bg-green-50 text-green-700">
                      <input type="checkbox" defaultChecked className="rounded border-zinc-300 text-green-600 focus:ring-green-600" />
                      Vegetarian
                    </label>
                    <label className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-xs">
                      <input type="checkbox" className="rounded border-zinc-300 text-black focus:ring-black" />
                      Vegan
                    </label>
                    <label className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-xs">
                      <input type="checkbox" className="rounded border-zinc-300 text-black focus:ring-black" />
                      Gluten-Free
                    </label>
                  </div>
                  
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Declared Allergens</label>
                    <input type="text" defaultValue="Dairy, Gluten" className="w-full text-sm border-zinc-300 rounded-md shadow-sm focus:border-black focus:ring-black" />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Liability Notice */}
            <div className="rounded-md bg-blue-50 p-4 mt-6">
              <div className="flex">
                <div className="ml-3 flex-1 md:flex md:justify-between">
                  <p className="text-sm text-blue-700">
                    By clicking &ldquo;Sign &amp; Approve Menu&rdquo;, you cryptographically sign this payload, confirming that the dietary tags, allergens, and prices are accurate to the best of your knowledge.
                  </p>
                </div>
              </div>
            </div>
            
          </div>
        </section>
      </div>
    </main>
  );
}
