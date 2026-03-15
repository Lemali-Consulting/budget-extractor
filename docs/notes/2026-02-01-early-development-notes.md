- [ ] Create blog post
  - [ ] Discuss methods
    - [ ] Make workflows available in a publicly available repository, free to be modified as needed.
    - [ ] Discuss use of AI
      - [ ] Note that AI was used to generate the code that extracted the data from the PDFs, (as opposed to having the AI inspect the PDFs to generate the summaries) so as to ensure that the methods could be replicable.  

Data was spot checked to ensure accuracy. 

There's a lot of useful data in the 2026-operating-budget pdf. How do I make proper use of all of it? The PDF is very large, over 300 pages. I have so far extracted some data, but I haven't extracted it comprehensively, and it's quite possible I'm missing some components. It's too much to give as-is to Claude. I did split it previously in split-pdf, which had some success, but not all of the splits were fully accurate, and I'm hesitant to redo it manually. What do you think?

My biggest challenge right now is converting the tables into something more human-readable. 

Suppose I had a PDF editor that automatically added boundaries so I could see what it would pull. 


-- 

Let's create csvs of the tables, compare those, and then when we make adjustments to the parser, we can compare it to that as a source of truth to ensure it doesn't regress. 