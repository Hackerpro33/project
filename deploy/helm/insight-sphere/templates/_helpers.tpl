{{- define "insight-sphere.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{- define "insight-sphere.backendFullname" -}}
{{- printf "%s-backend" (include "insight-sphere.name" .) -}}
{{- end -}}

{{- define "insight-sphere.frontendFullname" -}}
{{- printf "%s-frontend" (include "insight-sphere.name" .) -}}
{{- end -}}

{{- define "insight-sphere.redisFullname" -}}
{{- printf "%s-redis" (include "insight-sphere.name" .) -}}
{{- end -}}

{{- define "insight-sphere.postgresFullname" -}}
{{- printf "%s-postgres" (include "insight-sphere.name" .) -}}
{{- end -}}

{{- define "insight-sphere.unleashFullname" -}}
{{- printf "%s-unleash" (include "insight-sphere.name" .) -}}
{{- end -}}
