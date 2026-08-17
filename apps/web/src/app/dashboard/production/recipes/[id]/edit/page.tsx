'use client';

import { useParams } from 'next/navigation';
import { ProductionRecipeForm } from '../../production-recipe-form';

export default function EditProductionRecipePage() {
  const { id } = useParams<{ id: string }>();
  return <ProductionRecipeForm id={id} />;
}
