# Js Bin Export

## How to use it

Options can be passed by CLI commands

```sh
npm start -- --username=username --password=password
```

or by creating a copy of `config.json`, renaming it to `config.local.json` and editing its content.  
The `config.local.json` is ignored by git, while `config.json` is not.

### Options

| Name     | Type   |                                                                             |
| -------- | ------ | --------------------------------------------------------------------------- |
| username | string | JS Bin username                                                             |
| password | string | JS Bin password                                                             |
| folder   | string | folder where to save the files, relative to this project folder             |
| delay    | number | milliseconds of delay between each bin export, to avoid spamming the server |

### TODO

1. [x] login
1. [x] save cookie
1. [x] fetch list
1. [x] parse list
1. [ ] create html list
1. [x] fetch items
1. [x] add pub date
1. [x] config
1. [x] error checking
1. [ ] add last exported date field
