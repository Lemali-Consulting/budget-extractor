

Many of the pages are in inconsistent formats


Pittsburgh used to have a budget transparency tool, as seen by https://www.govtech.com/analytics/pittsburghs-new-budget-tool-makes-data-more-accessible, but that no longer exists

I had to leverage AI to help with developing custom scripts for analyzing the various tables and properly parsing them. 


Why?
- Not all tables have clearly defined borders. They rely on whitespace, which are much more difficult to detect
- Tables can have inconsistent formatting within tables. Total rows are often bolded, tables can be broken down into sections, rows within the same column may be left- or right-justified. 
- Different departments appear to use different tabular styles