# Third-party data

- **Country shapes** on the admin traffic globe come from [Natural Earth](https://www.naturalearthdata.com/) (public domain), distributed as `world-atlas` (ISC licence).
- **Country codes and centre points** in `src/data/globe-countries.json` come from [mledoze/countries](https://github.com/mledoze/countries), distributed as `world-countries` and licensed under the [Open Database Licence (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The coordinates are rounded to a tenth of a degree. Regenerate the file with `npm run globe:data`.
