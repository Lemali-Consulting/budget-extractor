/**Wrapper component for the cross-year comparison page with tabbed navigation.*/
import { useState, useEffect } from 'preact/hooks';
import CrossYearComparison from './CrossYearComparison.tsx';
import CrossYearPersonnel from './CrossYearPersonnel.tsx';
import CrossYearCapital from './CrossYearCapital.tsx';

type TabId = 'budget' | 'personnel' | 'capital';

const TABS: { id: TabId; label: string }[] = [
  { id: 'budget', label: 'Budget' },
  { id: 'personnel', label: 'Personnel' },
  { id: 'capital', label: 'Capital' },
];

interface Props {
  proposedBudgets: any[];
  adoptedBudgets: any[];
  proposedPersonnel: any[];
  adoptedPersonnel: any[];
  proposedCapital: any[];
  adoptedCapital: any[];
  /** Route prefix of the archive year the links point into (e.g. "/2026"). */
  routePrefix: string;
}

export default function CrossYearPage(props: Props) {
  const [active, setActive] = useState<TabId>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.slice(1) as TabId;
      if (TABS.some(t => t.id === hash)) return hash;
    }
    return 'budget';
  });

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.slice(1) as TabId;
      if (TABS.some(t => t.id === hash)) setActive(hash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function handleClick(id: TabId) {
    setActive(id);
    window.history.replaceState(null, '', `#${id}`);
  }

  return (
    <div>
      <div class="flex border-b mb-6" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => handleClick(tab.id)}
            class={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === tab.id
                ? 'border-ps-blue-600 text-ps-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === 'budget' && (
        <CrossYearComparison proposed={props.proposedBudgets} adopted={props.adoptedBudgets} routePrefix={props.routePrefix} />
      )}
      {active === 'personnel' && (
        <CrossYearPersonnel proposedPersonnel={props.proposedPersonnel} adoptedPersonnel={props.adoptedPersonnel} routePrefix={props.routePrefix} />
      )}
      {active === 'capital' && (
        <CrossYearCapital proposedProjects={props.proposedCapital} adoptedProjects={props.adoptedCapital} routePrefix={props.routePrefix} />
      )}
    </div>
  );
}
