package model

type SLARule struct {
	ID                    string         `json:"id"`
	CategoryID            string         `json:"category_id"`
	Priority              TicketPriority `json:"priority"`
	ResponseTimeMinutes   int            `json:"response_time_minutes"`
	ResolutionTimeMinutes int            `json:"resolution_time_minutes"`
}
