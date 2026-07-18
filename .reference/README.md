# Referências externas

Código de outros ecossistemas que inspirou (ou pode inspirar) recursos deste app.
Esta pasta é versionada no git, mas excluída do pacote publicado via `.homeyignore`.

| Arquivo | Origem | Por que está aqui |
|---|---|---|
| `hubitat-switch-bindings/` | [joelwetzel/Hubitat-Switch-Bindings](https://github.com/joelwetzel/Hubitat-Switch-Bindings) | Inspiração original do app. Anti-loop por janela de tempo (`responseTime`, global) — o nosso `suppress_ms` por device é derivado desse conceito. Sincroniza também dim/hue/sat/CT (ideia futura: dim sync). Os `tests/` documentam semânticas extras (master-only, one-way). |
| `link_two_switches.groovy` | SmartThings/Hubitat (kahn@lgk.com, 2015) | O "Link Two Switches" clássico: 2 devices, bidirecional, anti-loop por checagem de estado. Modelo para um eventual driver limitado a 2 devices (incl. modo inverse). |
| `ha-blueprint-switch-turn-on-off-entities.yaml` | [Blackshome (gist)](https://gist.github.com/Blackshome/dbcd8ebfdd0350144fc1503fc0fa8112) | Fonte das semânticas "any-on / all-off" (qualquer ON liga; só desliga quando todos OFF), "delay OFF" e "alternating entity" (inverse) — ideias futuras candidatas. |
