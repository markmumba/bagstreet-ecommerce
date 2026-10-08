import { LEGAL_POLICIES, POLICY_VERSION } from 'shared';
import { useSeo } from '@/hooks/useSeo';
import { CustomerCareLayout, PolicySection } from './CustomerCareLayout';

export function LegalPolicyPage({ policy }: { policy: keyof typeof LEGAL_POLICIES }) {
  const document = LEGAL_POLICIES[policy];
  useSeo({ title: document.title, description: `BagStreet ${document.title.toLowerCase()}, support and customer rights.`, canonicalPath: `/${policy}` });
  return (
    <CustomerCareLayout title={document.title} introduction={`Version ${POLICY_VERSION}. Effective 8 October 2026.`}>
      {document.sections.map(([heading, text]) => <PolicySection key={heading} title={heading}><p>{text}</p></PolicySection>)}
    </CustomerCareLayout>
  );
}
