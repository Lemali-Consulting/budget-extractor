# Embed codes for Public Source

**Date:** 2026-11-17
**Status:** open (the embeds work at the production address only once production is deployed)

Public Source asked for embed codes for three home-page pieces. Each is a frameable page under `/embed/` that shows just that piece, with a source line linking back to the site. Paste one of the codes below into a story. The frame starts at a height that fits the piece at a story-column width and on a phone. The short script resizes it to the piece's exact height, and it can be left out if the CMS strips scripts.

Each piece's links, including the department bars, open in a new tab, so the story stays put. The embeds carry no Google Analytics or Parse.ly tags: a reader viewing one is counted on the story's own page, and tagging the frame too would count every story view a second time.

## Budget summary (the five cards)

```html
<iframe data-pbe-embed src="https://budget.publicsource.org/embed/budget-summary/" title="Pittsburgh's 2027 budget at a glance" style="width:100%;border:0" height="450" loading="lazy"></iframe>
```

## Where the money flows

```html
<iframe data-pbe-embed src="https://budget.publicsource.org/embed/money-flow/" title="Where Pittsburgh's money flows" style="width:100%;border:0" height="340" loading="lazy"></iframe>
```

## Top departments by budget

```html
<iframe data-pbe-embed src="https://budget.publicsource.org/embed/top-departments/" title="Pittsburgh's largest departments by budget" style="width:100%;border:0" height="680" loading="lazy"></iframe>
```

## Resize script (once per story, after the embeds)

```html
<script>
window.addEventListener("message", function (e) {
  if (e.origin !== "https://budget.publicsource.org" || !e.data || e.data.type !== "pbe-embed-height") return;
  document.querySelectorAll("iframe[data-pbe-embed]").forEach(function (f) {
    if (f.contentWindow === e.source) f.style.height = e.data.height + "px";
  });
});
</script>
```

## Measured heights (2026-11-17)

| Embed | 700px story column | Phone (358px) |
|---|---|---|
| Budget summary | 412px | 448px |
| Where the money flows | 330px | 298px |
| Top departments by budget | 634px | 670px |

The starting heights above are the larger of each pair, plus a little room.
