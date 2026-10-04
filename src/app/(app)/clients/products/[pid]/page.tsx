'use client';
// Edit a saved product or service (frames 3f).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import ProductForm from '@/components/clients/ProductForm';
import { createClient } from '@/lib/supabase/client';
import { PRODUCT_COLS, normalizeProduct, type Product } from '@/lib/products';

export default function EditProduct() {
  const { pid } = useParams<{ pid: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data } = await supabase.from('products').select(PRODUCT_COLS).eq('id', pid).is('deleted_at', null).maybeSingle();
      setProduct(data ? normalizeProduct(data as Record<string, unknown>) : null);
    })().catch(() => setProduct(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  if (product === undefined) return <div className="mx-4 mt-4 h-48 animate-pulse rounded-card bg-surface-container" aria-busy="true" />;
  if (product === null) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-on-surface-variant">This item couldn’t be found.</p>
        <Link href="/clients?segment=products" className="btn-outline mx-auto mt-4 inline-flex px-5">Back to Products &amp; Services</Link>
      </div>
    );
  }
  return <ProductForm mode="edit" product={product} />;
}
