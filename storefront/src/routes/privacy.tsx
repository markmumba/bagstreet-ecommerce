import { createFileRoute } from '@tanstack/react-router';
import { LegalPolicyPage } from '@/components/customer-care/LegalPolicyPage';
export const Route = createFileRoute('/privacy')({ component: () => <LegalPolicyPage policy="privacy" /> });
