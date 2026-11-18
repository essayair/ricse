import ContractEditor from '@/components/contracts/contract-editor';

export default function ContractEditPage({ params }: { params: { id: string } }) {
  return <ContractEditor key={params.id} />;
}
