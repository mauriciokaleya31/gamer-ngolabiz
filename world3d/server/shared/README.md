# Cópia vendorizada de `world3d/shared`

Estes ficheiros são uma **cópia exacta** de `world3d/shared/*.js`. Existem aqui
porque algumas plataformas de alojamento Node.js de pasta única (ex.: Hostinger)
só implantam `world3d/server` — não conseguem ver a pasta irmã `world3d/shared`
de que este servidor depende (tempo de Luanda, zona, catálogo, emotes, nav,
RNG).

**Fonte da verdade:** `world3d/shared/`. O cliente web (`world3d/web`) continua
a servir-se directamente de lá.

**Depois de alterar qualquer ficheiro em `world3d/shared/`**, sincroniza esta
cópia antes de publicar:

```bash
npm run sync:shared
```

Se um dia deixar de ser preciso implantar `world3d/server` sozinho (por
exemplo, ao implantar a pasta `world3d` inteira como raiz), esta cópia pode
ser removida e as importações em `src/` revertidas para `../../shared/...`
/ `../../../shared/...`.
