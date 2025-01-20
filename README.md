# OneLink

New pure React implementation of OneLink.

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

Make sure you have the following installed:
- [Node.js](https://nodejs.org/) (version 22.9.0 or later)
- [npm](https://www.npmjs.com/) (version 6.x or later)
- [yarn](https://yarnpkg.com/)

### Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/yourusername/OneLink-new.git
    ```
2. Navigate to the project directory:
    ```sh
    cd OneLink-new
    ```
3. Install the dependencies:
    ```sh
    yarn
    ```
4. Generate Prisma config:
    ```sh
    npx prisma generate
    ```
5. Navigate to the server directory:
    ```sh
    cd OneLink-new/server
    ```
6. Install the server dependencies:
    ```sh
    yarn
    ```

### Running the Application

To start the front end, run:
```sh
cd Onelink; yarn run dev
```

To start the webserver, run:
```sh
cd Onelink/server; yarn run dev
```

The front end will be available at `http://localhost:5173`.
The webserver will be available at `http://localhost:3000`.
