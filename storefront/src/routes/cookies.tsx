import { createFileRoute } from '@tanstack/react-router';
import { LegalPolicyPage } from '@/components/customer-care/LegalPolicyPage';
export const Route = createFileRoute('/cookies')({ component: () => <LegalPolicyPage policy="cookies" /> });
