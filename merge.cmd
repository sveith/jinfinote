:: Merges all JS files used by the algorithm into a single one, for easier inclusion.

@echo off
copy algorithm\operations.js + algorithm\request.js + algorithm\state.js + algorithm\text.js jinfinote.js
