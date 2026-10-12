package model

import (
	"fmt"
	"net/url"
	"strconv"
	"time"
)

// WIB dipakai sebagai zona waktu bisnis untuk batas hari/bulan/tahun.
// FixedZone dipilih (bukan LoadLocation) supaya tidak bergantung pada
// database zona waktu OS, yang sering tidak ada di Windows.
var WIB = time.FixedZone("WIB", 7*60*60)

// Period adalah rentang waktu yang dipantau. To bersifat eksklusif
// (pakai `>= From AND < To` di query).
type Period struct {
	Kind  string    // "day" | "month" | "year"
	From  time.Time // awal periode
	To    time.Time // akhir periode (eksklusif)
	Trunc string    // argumen date_trunc: "hour" | "day" | "month"
	Fmt   string    // format to_char PostgreSQL untuk kunci bucket tren
}

// ParsePeriod membaca query string:
//
//	period = day | month | year   (default: month)
//	year, month, day              (default: hari ini menurut WIB)
func ParsePeriod(q url.Values, now time.Time) (Period, error) {
	now = now.In(WIB)

	kind := q.Get("period")
	if kind == "" {
		kind = "month"
	}
	year, err := intParam(q, "year", now.Year())
	if err != nil {
		return Period{}, err
	}
	month, err := intParam(q, "month", int(now.Month()))
	if err != nil {
		return Period{}, err
	}
	day, err := intParam(q, "day", now.Day())
	if err != nil {
		return Period{}, err
	}
	if year < 2000 || year > 2100 {
		return Period{}, fmt.Errorf("year di luar rentang yang didukung")
	}
	if month < 1 || month > 12 {
		return Period{}, fmt.Errorf("month harus 1-12")
	}

	switch kind {
	case "day":
		from := time.Date(year, time.Month(month), day, 0, 0, 0, 0, WIB)
		if from.Day() != day || int(from.Month()) != month {
			return Period{}, fmt.Errorf("tanggal tidak valid")
		}
		return Period{Kind: kind, From: from, To: from.AddDate(0, 0, 1), Trunc: "hour", Fmt: "YYYY-MM-DD HH24"}, nil
	case "month":
		from := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, WIB)
		return Period{Kind: kind, From: from, To: from.AddDate(0, 1, 0), Trunc: "day", Fmt: "YYYY-MM-DD"}, nil
	case "year":
		from := time.Date(year, time.January, 1, 0, 0, 0, 0, WIB)
		return Period{Kind: kind, From: from, To: from.AddDate(1, 0, 0), Trunc: "month", Fmt: "YYYY-MM"}, nil
	default:
		return Period{}, fmt.Errorf("period harus day, month, atau year")
	}
}

// Previous mengembalikan periode pembanding dengan jenis yang sama:
// kemarin, bulan lalu, atau tahun lalu.
func (p Period) Previous() Period {
	prev := p
	switch p.Kind {
	case "day":
		prev.From = p.From.AddDate(0, 0, -1)
	case "month":
		prev.From = p.From.AddDate(0, -1, 0)
	case "year":
		prev.From = p.From.AddDate(-1, 0, 0)
	}
	prev.To = p.From
	return prev
}

// DayPeriod membuat periode satu hari penuh (WIB) yang memuat t.
func DayPeriod(t time.Time) Period {
	t = t.In(WIB)
	from := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, WIB)
	return Period{Kind: "day", From: from, To: from.AddDate(0, 0, 1), Trunc: "hour", Fmt: "YYYY-MM-DD HH24"}
}

func intParam(q url.Values, key string, def int) (int, error) {
	s := q.Get(key)
	if s == "" {
		return def, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0, fmt.Errorf("parameter %s tidak valid", key)
	}
	return n, nil
}
