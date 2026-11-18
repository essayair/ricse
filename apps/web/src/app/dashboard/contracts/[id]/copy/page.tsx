import ContractEditor from '@/components/contracts/contract-editor';

export default function ContractCopyPage({ params }: { params: { id: string } }) {
  return <ContractEditor key={params.id} copyMode />;
}
