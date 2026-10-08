import { createFileRoute } from '@tanstack/react-router';
import { LegalPolicyPage } from '@/components/customer-care/LegalPolicyPage';
export const Route = createFileRoute('/terms')({ component: () => <LegalPolicyPage policy="terms" /> });
