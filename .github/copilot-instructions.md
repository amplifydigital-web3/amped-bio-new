If you need to write commnets, write them only in english.
Use only zod to create schemas.
Prefer to use tailwind classes to do style instead of creating css files.
Write UI texts only in english.
Create functions, classes, variables only with english names.
We use pnpm, turborepo and pnpm-workspace.
At our server we are implementing trpc to replace express REST.
To run prisma commands you need to use the filter `--filter=server` to run them only in the server package.
After change prisma schema and create a new migration run `pnpm --filter server run prisma:generate`
Use only lucide-react for icons or react-icons if the icon is not available in lucide-react.
Use only tailwind for styles.
When user asks you to create an alert or a warning, use the tailwind classes and add a icon from lucide.
If you want something both in the server and client, use the package "constants" located in `packages/constants` to put the code there. 
NEVER screate scripts to test some part of the code, just do what the user asks you to do.