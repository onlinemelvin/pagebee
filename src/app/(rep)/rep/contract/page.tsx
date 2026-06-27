import { getRepWorkspace, getRepContract, getCommissionTerms } from "@/lib/modules/sales";
import { ContractSign, type ContractView, type ContractTermsView } from "@/components/rep/ContractSign";

export const dynamic = "force-dynamic";

export default async function RepContractPage() {
  const ws = await getRepWorkspace();
  if (!ws) return null;

  const [contract, terms] = await Promise.all([getRepContract(ws.employee.id), getCommissionTerms()]);

  const contractView: ContractView | null = contract
    ? {
        id: contract.id,
        status: contract.status,
        title: contract.title,
        signedAt: contract.signedAt ? contract.signedAt.toISOString() : null,
        commissionTerms: contract.commissionTerms,
      }
    : null;

  const termsView: ContractTermsView = {
    planName: terms.planName,
    bases: terms.bases,
    floors: terms.floors,
    listedSetup: terms.listedSetup,
    clawbackDays: terms.clawbackDays,
    recurringPct: terms.recurringPct,
    recurringMonths: terms.recurringMonths,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl text-stone-900">Your agreement</h1>
        <p className="mt-1 text-sm text-stone-500">Review your commission terms and sign to start selling.</p>
      </div>
      <ContractSign contract={contractView} terms={termsView} />
    </div>
  );
}
