<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="2.0">
    <xsl:output method="xhtml" omit-xml-declaration="yes" doctype-public="-//W3C//DTD XHTML 1.0 Strict//EN" doctype-system="http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd" />
    
    <xsl:template match="/infinote-test">
        <html>
            <head>
                <title>jinfinote Test <xsl:call-template name="source-filename" /></title>
                <link rel="stylesheet" type="text/css" href="test.css" />
                <script type="text/javascript" src="../algorithm/state.js"></script>
				<script type="text/javascript" src="../algorithm/request.js"></script>
                <script type="text/javascript" src="../algorithm/text.js"></script>
                <script type="text/javascript" src="../algorithm/operations.js"></script>
                <script type="text/javascript" src="test-helper.js"></script>
            </head>
            <body>
                <div id="header" class="block">
                    <h1>jinfinote Test <a>
                        <xsl:attribute name="href">sources/<xsl:call-template name="source-filename" /></xsl:attribute>
                        <xsl:call-template name="source-filename" />
                    </a></h1>
                    <a href="#" onclick="document.location.reload(); return false;">Reload</a>
                </div>
                <hr />
                <xsl:apply-templates />
                <hr />
                <div id="footer" class="block">
                    Generated from <a>
                        <xsl:attribute name="href">sources/<xsl:call-template name="source-filename" /></xsl:attribute>
                        <xsl:call-template name="source-filename" />
                    </a> by <xsl:value-of select="system-property('xsl:product-name')" /><xsl:value-of select="system-property('xsl:product-version')"/> on <xsl:value-of select="current-dateTime()" />
                </div>
            </body>
        </html>
    </xsl:template>
    
    <xsl:template match="initial-buffer">
        <div class="block">
            <h2>Initial buffer</h2> <xsl:if test="count(segment)=0"><span class="light">&lt;empty&gt;</span></xsl:if>
            <xsl:apply-templates select="segment" />
        </div>
        <script type="text/javascript">
            test_initial_buffer([<xsl:for-each select="segment">
                new Segment(<xsl:value-of select="@author" />, "<xsl:value-of select="text()" />")<xsl:if test="exists(following-sibling::segment)">,</xsl:if>
            </xsl:for-each>]);
        </script>
    </xsl:template>
    
    <xsl:template match="segment">
        <span>
            <xsl:attribute name="class">segment user-<xsl:value-of select="@author" /></xsl:attribute>
            <xsl:value-of select="text()" />
        </span>
    </xsl:template>
    
    <xsl:template match="request">
        <div>
            <xsl:if test="child::insert">
                <xsl:attribute name="class">insert request user-<xsl:value-of select="@user" /></xsl:attribute>
                <h2>Insert</h2> <tt><xsl:value-of select="insert/text()"/></tt> at position <xsl:value-of select="insert/@pos" />
            </xsl:if>
            <xsl:if test="child::delete">
                <xsl:attribute name="class">delete request user-<xsl:value-of select="@user" /></xsl:attribute>
                <h2>Delete</h2> <xsl:value-of select="delete/@len" /> character<xsl:if test="number(delete/@len) != 1">s</xsl:if> from position <xsl:value-of select="delete/@pos" />
            </xsl:if>
            <xsl:if test="child::undo">
                <xsl:attribute name="class">undo request user-<xsl:value-of select="@user" /></xsl:attribute>
                <h2>Undo</h2>
            </xsl:if>
            <xsl:if test="child::redo">
                <xsl:attribute name="class">redo request user-<xsl:value-of select="@user" /></xsl:attribute>
                <h2>Redo</h2>
            </xsl:if>
            <p>Issued by user <xsl:value-of select="@user" /><xsl:if test="@time!=''"> with a time delta of <xsl:value-of select="@time" /></xsl:if></p>
        </div>
        <script type="text/javascript">
            <xsl:if test="child::insert or child::delete">
                test_request(<xsl:value-of select="@user" />, "<xsl:value-of select="@time" />", <xsl:apply-templates />);
            </xsl:if>
            <xsl:if test="child::undo">
                test_undo_request(<xsl:value-of select="@user" />, "<xsl:value-of select="@time" />");
            </xsl:if>
            <xsl:if test="child::redo">
                test_redo_request(<xsl:value-of select="@user" />, "<xsl:value-of select="@time" />");
            </xsl:if>
        </script>
    </xsl:template>
    
    <xsl:template match="request/insert">new Operations.Insert(<xsl:value-of select="@pos" />, new Buffer([new Segment(<xsl:value-of select="parent::request/@user" />, "<xsl:value-of select="text()" />")]))</xsl:template>
    <xsl:template match="request/delete">new Operations.Delete(<xsl:value-of select="@pos" />, <xsl:value-of select="@len" />)</xsl:template>
    
    <xsl:template match="final-buffer">
        <div class="block">
            <h2>Expected buffer</h2> <xsl:if test="count(segment)=0"><span class="light">&lt;empty&gt;</span></xsl:if>
            <xsl:apply-templates select="segment" />
        </div>
        <script type="text/javascript">
            test_final_buffer([<xsl:for-each select="segment">
                new Segment(<xsl:value-of select="@author" />, "<xsl:value-of select="text()" />")<xsl:if test="exists(following-sibling::segment)">,</xsl:if>
            </xsl:for-each>]);
        </script>
    </xsl:template>
    
    <xsl:template name="fileName">
        <xsl:param name="path" />
        <xsl:choose>
            <xsl:when test="contains($path,'\')">
                <xsl:call-template name="fileName">
                    <xsl:with-param name="path" select="substring-after($path,'\')" />
                </xsl:call-template>
            </xsl:when>
            <xsl:when test="contains($path,'/')">
                <xsl:call-template name="fileName">
                    <xsl:with-param name="path" select="substring-after($path,'/')" />
                </xsl:call-template>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="$path" />
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>
    <xsl:template name="source-filename">
        <xsl:call-template name="fileName">
            <xsl:with-param name="path">
                <xsl:value-of select="base-uri()" />
            </xsl:with-param>
        </xsl:call-template>
    </xsl:template>
</xsl:stylesheet>
