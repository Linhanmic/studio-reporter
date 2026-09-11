package report

import (
	"bytes"
	"html"
	"strconv"
)

func writeFilterToolbar(b *bytes.Buffer, specs, scenarios Counts) {
	b.WriteString("<div class=\"toolbar\">")
	writeFilterGroup(b, "spec", "规格书", specs)
	writeFilterGroup(b, "scenario", "场景", scenarios)
	b.WriteString("<input class=\"search-input\" type=\"search\" placeholder=\"搜索规格书 / 场景\" aria-label=\"搜索规格书或场景\">")
	b.WriteString("<div class=\"toolbar-actions\">")
	b.WriteString("<button type=\"button\" class=\"action-btn\" data-action=\"expand-all\">全部展开</button>")
	b.WriteString("<button type=\"button\" class=\"action-btn\" data-action=\"collapse-all\">全部折叠</button>")
	b.WriteString("<button type=\"button\" class=\"action-btn\" data-action=\"fail-steps-only\" aria-pressed=\"false\" title=\"隐藏通过/跳过的场景与步骤，只保留失败场景中的失败步骤并展开\">仅失败步骤</button>")
	b.WriteString("<button type=\"button\" class=\"action-btn\" data-action=\"copy-fail-summary\" title=\"复制当前可见失败场景的摘要到剪贴板\">复制失败摘要</button>")
	b.WriteString("<button type=\"button\" class=\"action-btn\" data-action=\"copy-share-link\" title=\"复制当前过滤/定位的可分享链接到剪贴板\">复制可见范围链接</button>")
	b.WriteString("<span class=\"status-msg\" role=\"status\" aria-live=\"polite\"></span>")
	b.WriteString("</div></div>\n")
}

func writeFilterGroup(b *bytes.Buffer, scope, label string, c Counts) {
	b.WriteString("<div class=\"filter-group\" role=\"group\" aria-label=\"")
	b.WriteString(html.EscapeString(label))
	b.WriteString("过滤\" data-scope=\"")
	b.WriteString(html.EscapeString(scope))
	b.WriteString("\">\n")
	writeFilterBtn(b, scope, "all", "全部", c.Total, true)
	writeFilterBtn(b, scope, VerdictFail, "失败", c.Failed, false)
	writeFilterBtn(b, scope, VerdictPass, "通过", c.Passed, false)
	writeFilterBtn(b, scope, VerdictSkip, "跳过", c.Skipped, false)
	b.WriteString("</div>\n")
}

func writeFilterBtn(b *bytes.Buffer, scope, filter, label string, count int, active bool) {
	b.WriteString("<button type=\"button\" class=\"filter-btn filter-")
	b.WriteString(html.EscapeString(filter))
	if active {
		b.WriteString(" active")
	}
	b.WriteString("\" data-scope=\"")
	b.WriteString(html.EscapeString(scope))
	b.WriteString("\" data-filter=\"")
	b.WriteString(html.EscapeString(filter))
	b.WriteString("\" aria-pressed=\"")
	if active {
		b.WriteString("true")
	} else {
		b.WriteString("false")
	}
	b.WriteString("\">")
	b.WriteString(html.EscapeString(label))
	b.WriteString(" <span class=\"filter-count\">")
	b.WriteString(strconv.Itoa(count))
	b.WriteString("</span></button>\n")
}

func writeReportBlockOpen(b *bytes.Buffer, tone, verdict, kind, id, name string, open bool) {
	b.WriteString("<details class=\"report-block ")
	b.WriteString(tone)
	b.WriteString("\" data-verdict=\"")
	b.WriteString(html.EscapeString(verdict))
	b.WriteString("\" data-kind=\"")
	b.WriteString(html.EscapeString(kind))
	if id != "" {
		b.WriteString("\" id=\"")
		b.WriteString(html.EscapeString(id))
	}
	if name != "" {
		b.WriteString("\" data-name=\"")
		b.WriteString(html.EscapeString(name))
	}
	if open {
		b.WriteString("\" open>\n")
	} else {
		b.WriteString("\">\n")
	}
}

func writeStatCard(b *bytes.Buffer, label, kind string, c Counts) {
	b.WriteString("<div class=\"stat-card\" data-stat-kind=\"")
	b.WriteString(html.EscapeString(kind))
	b.WriteString("\"><div class=\"label\">")
	b.WriteString(html.EscapeString(label))
	b.WriteString("</div><div class=\"value\" data-stat-value>")
	b.WriteString(html.EscapeString(FormatCountsRatio(c)))
	b.WriteString("</div><div class=\"sub\" data-stat-sub>")
	b.WriteString(html.EscapeString(FormatCountsSub(c)))
	b.WriteString("</div></div>\n")
}
