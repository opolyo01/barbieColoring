import dotenv from 'dotenv';
import { resolve } from 'path';

// Resolve the server env file relative to this package so startup does not
// depend on the shell's current working directory.
dotenv.config({
  path: resolve(__dirname, '../.env'),
  override: true,
});
