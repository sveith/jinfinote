@echo off
set SAXON="%PROGRAMFILES%\Saxonica\SaxonHE9.3N\bin\Transform.exe"

REM for %%F in (sources\*.xml) do %SAXON% -xsl:sources/test-transform.xsl -o:%%~nF.html %%F
for %%F in (sources\*.xml) do %SAXON% -xsl:sources/test-transform-random.xsl -o:random\%%~nF.html %%F
