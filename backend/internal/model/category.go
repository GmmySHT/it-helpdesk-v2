package model

type Category struct {
	ID                        string `json:"id"`
	Name                      string `json:"name"`
	Description               string `json:"description,omitempty"`
	Code                      string `json:"code,omitempty"`
	RequiresAnalysisApproval  bool   `json:"requires_analysis_approval"`
}
