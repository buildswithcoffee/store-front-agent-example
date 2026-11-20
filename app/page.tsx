import { evaluate } from "flags/next";
import Link from "next/link";

import ShopPage from "@/app/shop/page";

import { AskScoutButton } from "@/components/agent/ask-scout";
import { VercelTip } from "@/components/demo-mode";
import { HeroLandscape, KitchenScene, TrailScene } from "@/components/home/art";
import { ProductCard } from "@/components/product-card";
import { brandHomeFlag, scoutEnabledFlag } from "@/lib/flags";
import { formatPrice } from "@/lib/format";
import { getProductsBySlugs, type Product } from "@/lib/store";
import { VERCEL_LINKS } from "@/lib/vercel-links";

// The brand's front door: a hero, the categories, a few curated edits, and Scout. The full
// catalog lives at /shop. With the brand-home flag off, / shows that catalog instead. Rows are picked by slug, so a slug that leaves the catalog just drops out.
const CATEGORY_TILES = [
  { category: "Apparel", slug: "fleece-half-zip", blurb: "Layers for every season" },
  { category: "Bags", slug: "daypack-20l", blurb: "Packs, totes and duffels" },
  { category: "Accessories", slug: "wool-beanie", blurb: "The small things that matter" },
  { category: "Home", slug: "enamel-dutch-oven", blurb: "Cook, gather, unwind" },
];
const FAVORITES = ["trail-shell-jacket", "merino-crew-sweater", "down-puffer-vest", "daypack-20l"];
const LAYERS = [
  { role: "Base", slug: "merino-base-layer" },
  { role: "Mid", slug: "fleece-half-zip" },
  { role: "Shell", slug: "trail-shell-jacket" },
];
const HOME_GOODS = ["stovetop-kettle", "enamel-mug-set", "camp-blanket", "cedar-candle"];
// The holiday gift guide's picks, all under $50.
const GIFTS = ["wool-beanie", "wool-scarf", "insulated-bottle-750", "canvas-wallet"];

const SCOUT_PROMPTS = ["Warm layers for a fall hike", "Does the fleece run small?", "A gift under $50", "Where's my order?"];

export default async function HomePage(props: { searchParams: Promise<{ category?: string }> }) {
  const [brandHome, scout] = await evaluate([brandHomeFlag, scoutEnabledFlag]);
  if (!brandHome) return <ShopPage {...props} />;

  const slugs = [...CATEGORY_TILES.map((t) => t.slug), ...FAVORITES, ...LAYERS.map((l) => l.slug), ...HOME_GOODS, ...GIFTS];
  const products = new Map((await getProductsBySlugs([...new Set(slugs)])).map((p) => [p.slug, p]));
  const pick = (list: string[]) => list.flatMap((slug) => products.get(slug) ?? []);

  return (
    <div data-full-bleed>
      <Hero scout={scout} />

      <Section eyebrow="Shop by category" title="Everything for out there, and back home.">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {CATEGORY_TILES.map((tile) => (
            <CategoryTile key={tile.category} {...tile} image={products.get(tile.slug)?.image} />
          ))}
        </div>
      </Section>

      <Section eyebrow="Field favorites" title="The pieces our customers reach for first." action={{ href: "/shop", label: "Shop all" }}>
        <ProductRow products={pick(FAVORITES)} />
      </Section>

      <Section eyebrow="Holiday gift guide" title="Thoughtful gifts under $50." action={{ href: "/shop?category=Accessories", label: "Shop accessories" }}>
        <p className="-mt-4 mb-8 text-sm text-pine">Order by December 18 for delivery before the holidays.</p>
        <ProductRow products={pick(GIFTS)} />
      </Section>

      <LayeringEdit
        scout={scout}
        layers={LAYERS.flatMap((l) => (products.has(l.slug) ? [{ role: l.role, product: products.get(l.slug)! }] : []))}
      />

      {scout && <MeetScout />}

      <Section eyebrow="For the home" title="Slow mornings, well equipped." action={{ href: "/shop?category=Home", label: "Shop home" }}>
        <div className="mb-10 overflow-hidden rounded-3xl">
          <KitchenScene className="aspect-[5/2] w-full min-h-56" />
        </div>
        <ProductRow products={pick(HOME_GOODS)} />
      </Section>

      <Promises scout={scout} />
    </div>
  );
}

function Hero({ scout }: { scout: boolean }) {
  return (
    <section className="relative isolate flex h-[78vh] min-h-[540px] max-h-[760px] overflow-hidden bg-sand">
      <HeroLandscape className="absolute inset-0 -z-10 size-full" />
      <div className="mx-auto w-full max-w-6xl px-4 pt-14 sm:pt-24">
        <p className="text-xs font-medium tracking-[0.25em] text-moss uppercase">Outdoor · Home</p>
        <h1 className="mt-4 max-w-2xl font-display text-5xl leading-[1.05] tracking-tight text-forest sm:text-7xl">Made for the long way round.</h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-pine sm:text-lg">
          Gear and goods in honest materials, built for early starts, long trails and slow mornings.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/shop" className="rounded-full bg-forest px-6 py-3 text-sm font-medium text-sand shadow-sm hover:bg-pine">
            Shop the collection
          </Link>
          {scout && (
            <AskScoutButton className="rounded-full bg-white/70 px-6 py-3 text-sm font-medium text-forest ring-1 ring-forest/20 backdrop-blur hover:bg-white">
              Ask Scout what to pack
            </AskScoutButton>
          )}
        </div>
      </div>
    </section>
  );
}

function Section({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-moss uppercase">{eyebrow}</p>
          <h2 className="mt-2 font-display text-3xl tracking-tight text-forest sm:text-4xl">{title}</h2>
        </div>
        {action && (
          <Link href={action.href} className="text-sm font-medium text-forest underline underline-offset-4 hover:no-underline">
            {action.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function CategoryTile({ category, blurb, image }: { category: string; blurb: string; image?: string }) {
  return (
    <Link href={`/shop?category=${encodeURIComponent(category)}`} className="group relative block overflow-hidden rounded-2xl bg-sage">
      {image && <img src={image} alt="" width={800} height={800} className="aspect-[4/5] w-full object-cover transition duration-500 group-hover:scale-105" />}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-forest/80 to-transparent p-4 pt-16 text-sand">
        <p className="font-display text-xl sm:text-2xl">{category}</p>
        <p className="text-xs text-sand/80 sm:text-sm">{blurb}</p>
      </div>
    </Link>
  );
}

function ProductRow({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

function LayeringEdit({ layers, scout }: { layers: { role: string; product: Product }[]; scout: boolean }) {
  return (
    <section className="bg-sand">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16">
        <div className="overflow-hidden rounded-3xl">
          <TrailScene className="aspect-[8/9] w-full" />
        </div>
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-moss uppercase">The layering edit</p>
          <h2 className="mt-2 font-display text-3xl tracking-tight text-forest sm:text-5xl">Three layers, any weather.</h2>
          <p className="mt-4 max-w-md leading-relaxed text-pine">
            A base that handles sweat, a mid that holds warmth, and a shell that keeps out wind and rain. Add or shed one as the day changes.
          </p>
          <ol className="mt-8 divide-y divide-forest/10 border-y border-forest/10">
            {layers.map(({ role, product }) => (
              <li key={product.slug}>
                <Link href={`/products/${product.slug}`} className="group flex items-center gap-4 py-4">
                  <img src={product.image} alt="" width={64} height={64} className="size-16 rounded-xl object-cover" />
                  <span className="flex-1">
                    <span className="block text-xs tracking-[0.2em] text-moss uppercase">{role}</span>
                    <span className="block font-medium text-forest group-hover:underline">{product.name}</span>
                  </span>
                  <span className="text-sm text-pine">{formatPrice(product.priceCents)}</span>
                </Link>
              </li>
            ))}
          </ol>
          {scout && (
            <AskScoutButton
              prompt="Help me pick layers for a cold, wet hike."
              className="mt-8 rounded-full bg-forest px-6 py-3 text-sm font-medium text-sand hover:bg-pine"
            >
              Ask Scout to build your layers
            </AskScoutButton>
          )}
        </div>
      </div>
    </section>
  );
}

function MeetScout() {
  return (
    <section className="bg-forest text-sand">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-2">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium tracking-[0.2em] text-sage uppercase">
            Meet Scout
            <VercelTip product="Agent Runs" href={VERCEL_LINKS.agentRuns}>
              Scout is an eve agent running on Vercel. Each chat is a durable session, and every turn shows in Agent Runs with the model it used, the tools it
              called, and what it cost.
            </VercelTip>
          </p>
          <h2 className="mt-2 font-display text-3xl tracking-tight sm:text-5xl">A guide who knows every shelf.</h2>
          <p className="mt-4 max-w-md leading-relaxed text-sand/75">
            Scout helps you find the right gear, check a fit, add things to your cart, track an order, or start a return from a photo. Ask anything, any
            time.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {SCOUT_PROMPTS.map((prompt) => (
              <AskScoutButton
                key={prompt}
                prompt={prompt}
                className="rounded-full px-4 py-2 text-sm text-sand ring-1 ring-sand/30 transition hover:bg-sand hover:text-forest"
              >
                {prompt}
              </AskScoutButton>
            ))}
          </div>
        </div>
        {/* An example exchange, to show what Scout is like before anyone opens it. */}
        <div aria-hidden className="rounded-3xl bg-sand p-5 text-sm text-neutral-800 shadow-2xl sm:p-6">
          <div className="flex items-center gap-3 border-b border-neutral-900/10 pb-4">
            <span className="flex size-9 items-center justify-center rounded-full bg-forest font-display text-sand">S</span>
            <span>
              <span className="block font-semibold text-forest">Scout</span>
              <span className="block text-xs text-neutral-500">Products, sizing, orders, and your cart</span>
            </span>
          </div>
          <div className="mt-4 space-y-3">
            <p className="ml-auto max-w-[80%] rounded-2xl bg-forest px-3 py-2 text-sand">I run cold. What should I wear for a fall hike?</p>
            <p className="max-w-[90%] leading-relaxed">
              Start with the Merino Base Layer, add the Fleece Half-Zip for warmth, and keep the Trail Shell Jacket in your pack for wind and rain. Want me
              to add all three to your cart?
            </p>
            <p className="ml-auto max-w-[80%] rounded-2xl bg-forest px-3 py-2 text-sand">Yes, in a medium.</p>
            <p className="max-w-[90%] leading-relaxed">Done. All three are in your cart in medium.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// The same terms Scout gives in its shipping, promotions and returns skills.
const PROMISES = [
  { title: "Ships next business day", body: "Every order leaves within one business day, with tracking." },
  { title: "Free shipping over $75", body: "A flat $6 under that." },
  { title: "30-day returns", body: "Unworn with tags? Send it back, or swap the size for free." },
  { title: "Help from Scout", body: "Sizing, orders and returns, answered in seconds.", scout: true },
];

function Promises({ scout }: { scout: boolean }) {
  return (
    <section className="border-t border-neutral-200 bg-white">
      <ul className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {PROMISES.filter((p) => scout || !p.scout).map((p) => (
          <li key={p.title}>
            <p className="font-display text-lg text-forest">{p.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">{p.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
