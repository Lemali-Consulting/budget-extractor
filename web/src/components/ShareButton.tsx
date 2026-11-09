/**Share-to-clipboard button for section pages and tables.*/

interface Props {
  url: string;
  label?: string;
}

export default function ShareButton({ url, label = 'Share' }: Props) {
  const handleClick = () => {
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      const btn = document.activeElement as HTMLButtonElement | null;
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'Link copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }
    });
  };

  return (
    <button
      onClick={handleClick}
      class="text-xs text-gray-400 hover:text-ps-blue-600 print:hidden"
      title="Copy link to clipboard"
    >
      {label}
    </button>
  );
}
