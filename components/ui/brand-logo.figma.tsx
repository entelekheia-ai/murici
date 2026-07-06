/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import figma from '@figma/code-connect';
import { BrandLogo } from './brand-logo';

figma.connect(
  BrandLogo,
  "https://www.figma.com/design/oowraj4cFX3FlyWVLN4OSb/Murici?node-id=65:2239",
  {
    props: {
      // Map properties if variants are needed in the future
    },
    example: () => <BrandLogo />
  }
);
